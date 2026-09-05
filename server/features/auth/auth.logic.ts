import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../../config.js";
import { ApiError } from "../../shared/errors.js";
import { slugify, uniqueSlug } from "../../shared/slug.js";
import * as data from "./auth.data.js";
import {
  createDefault as createDefaultProfile,
  list as listProfiles,
} from "../profiles/profiles.logic.js";
import type { CompanyModel, UserModel } from "../../database/models/index.js";
import type { SessionResponse } from "../../../shared/api.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * LOGIC -- validation, hashing, token issuing. Talks to `auth.data.ts` for
 * persistence and knows nothing about req/res.
 */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const companySchema = z.object({
  name: z.string().trim().min(2, "Company name is too short.").max(80),
});

interface JwtPayload {
  sub: Uuid;
}

function issueToken(user: UserModel): string {
  return jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub };
  } catch {
    return null;
  }
}

export async function register(
  payload: unknown,
): Promise<{ user: UserModel; token: string }> {
  const { email, password } = credentialsSchema.parse(payload);

  const existing = await data.findUserByEmail(email);
  if (existing) {
    throw ApiError.conflict("An account with that email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await data.insertUser({ email, passwordHash });

  return { user, token: issueToken(user) };
}

export async function login(
  payload: unknown,
): Promise<{ user: UserModel; token: string }> {
  const { email, password } = credentialsSchema.parse(payload);

  const user = await data.findUserByEmail(email);
  // Compare against a dummy hash when the user is missing so that a wrong
  // email and a wrong password take the same time to answer.
  const hash =
    user?.password_hash ??
    "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduu";
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    throw ApiError.unauthorized("Incorrect email or password.");
  }

  return { user, token: issueToken(user) };
}

/**
 * Step 2 of onboarding. Creating the company also mints the gateway token --
 * the single credential the company's AI clients will use.
 */
export async function createCompany(
  userId: Uuid,
  payload: unknown,
): Promise<CompanyModel> {
  const { name } = companySchema.parse(payload);

  const user = await data.findUserById(userId);
  if (!user) throw ApiError.unauthorized();
  if (user.company_id) {
    throw ApiError.conflict("This account already belongs to a company.");
  }

  const base = slugify(name, "company");

  // Read the whole family of existing slugs rather than probing a fixed
  // number of guesses. Probing nine candidates meant the tenth company named
  // "Acme Inc" fell off the end and got an unreadable random-hex slug.
  const existing = await data.listSlugsLike(base);
  const taken = new Set(existing.map((row) => row.slug));

  // Retry on a unique violation: two people signing up with the same company
  // name at the same moment both read the same set and pick the same slug.
  // The database is the arbiter, so let it arbitrate.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = uniqueSlug(base, taken);

    try {
      const company = await data.insertCompany({ name, slug });

      // Every user needs at least one profile: it is what carries the gateway
      // token, so without one there is no way to reach the gateway.
      await createDefaultProfile({ userId: user.id, companyId: company.id });
      await data.attachUserToCompany(user.id, company.id);
      return company;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Someone took it between our read and our write; exclude and retry.
      taken.add(slug);
    }
  }

  throw ApiError.conflict("Could not allocate a workspace name. Try another.");
}

/** Postgres 23505, wrapped by Objection one level down. */
function isUniqueViolation(error: unknown): boolean {
  const sqlError = error as { code?: string; nativeError?: { code?: string } };
  return sqlError?.code === "23505" || sqlError?.nativeError?.code === "23505";
}

/** The payload every screen bootstraps from: who am I, and what can I reach. */
export async function getSession(userId: Uuid): Promise<SessionResponse> {
  const user = await data.findUserWithCompany(userId);
  if (!user) throw ApiError.unauthorized();

  if (!user.company) {
    return { user: { id: user.id, email: user.email }, company: null, profiles: [] };
  }

  return {
    user: { id: user.id, email: user.email },
    company: {
      id: user.company.id,
      name: user.company.name,
      slug: user.company.slug,
    },
    // Profiles ship with the session because every screen needs them: the
    // switcher, the endpoint panel, and the connect flow all read from here.
    // Scoped to the user -- a colleague's profiles are none of their business.
    profiles: await listProfiles(user.id),
  };
}

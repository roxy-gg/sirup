import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../../config.js";
import { ApiError } from "../../shared/errors.js";
import { slugify, uniqueSlug, generateGatewayToken } from "../../shared/slug.js";
import * as data from "./auth.data.js";

/**
 * LOGIC -- validation, hashing, token issuing. Talks to `auth.data.js` for
 * persistence and knows nothing about req/res.
 */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const companySchema = z.object({
  name: z.string().trim().min(2, "Company name is too short.").max(80),
});

function issueToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export async function register(payload) {
  const { email, password } = credentialsSchema.parse(payload);

  const existing = await data.findUserByEmail(email);
  if (existing) {
    throw ApiError.conflict("An account with that email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await data.insertUser({ email, passwordHash });

  return { user, token: issueToken(user) };
}

export async function login(payload) {
  const { email, password } = credentialsSchema.parse(payload);

  const user = await data.findUserByEmail(email);
  // Compare against a dummy hash when the user is missing so that a wrong
  // email and a wrong password take the same time to answer.
  const hash = user?.password_hash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduu";
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
export async function createCompany(userId, payload) {
  const { name } = companySchema.parse(payload);

  const user = await data.findUserById(userId);
  if (!user) throw ApiError.unauthorized();
  if (user.company_id) {
    throw ApiError.conflict("This account already belongs to a company.");
  }

  const base = slugify(name, "company");
  const taken = new Set();
  // Slugs are globally unique, so probe rather than fetching every company.
  for (const candidate of [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)]) {
    // eslint-disable-next-line no-await-in-loop
    if (await data.findCompanyBySlug(candidate)) taken.add(candidate);
  }

  const company = await data.insertCompany({
    name,
    slug: uniqueSlug(base, taken),
    gatewayToken: generateGatewayToken(),
  });

  await data.attachUserToCompany(user.id, company.id);

  return company;
}

/** The payload every screen bootstraps from: who am I, and what's my company. */
export async function getSession(userId) {
  const user = await data.findUserWithCompany(userId);
  if (!user) throw ApiError.unauthorized();

  return {
    user: { id: user.id, email: user.email },
    company: user.company
      ? {
          id: user.company.id,
          name: user.company.name,
          slug: user.company.slug,
          gateway_token: user.company.gateway_token,
        }
      : null,
  };
}

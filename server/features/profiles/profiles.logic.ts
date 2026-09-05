import { z } from "zod";
import { ApiError } from "../../shared/errors.js";
import { isUuid, UUID_RE } from "../../shared/uuid.js";
import { slugify, uniqueSlug, generateGatewayToken } from "../../shared/slug.js";
import * as data from "./profiles.data.js";
import { listServers } from "../mcp-servers/mcpServers.data.js";
import type { ProfileModel } from "../../database/models/index.js";
import type { Profile, Uuid } from "../../../shared/domain.js";

/**
 * LOGIC -- profiles and what they expose.
 *
 * A profile is a named subset of the company's connections plus its own
 * gateway token. That token is what makes a profile mean something: pointing a
 * client at the "Ops" token yields a different tool list than "Frontend",
 * from the same pool of connected accounts.
 */

const nameSchema = z.object({
  name: z.string().trim().min(1, "Give this profile a name.").max(60),
  server_ids: z.array(z.string().regex(UUID_RE)).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  is_default: z.boolean().optional(),
});

function assertProfileId(profileId: string): asserts profileId is Uuid {
  if (!isUuid(profileId)) throw ApiError.notFound("Profile not found.");
}

/** Adds the counts the UI needs, which are not columns on the row. */
async function decorate(
  userId: Uuid,
  profiles: ProfileModel[],
): Promise<Profile[]> {
  const counts = await data.countsByProfile(userId);

  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    gateway_token: profile.gateway_token,
    is_default: profile.is_default,
    server_count: counts.get(profile.id)?.servers ?? 0,
    tool_count: counts.get(profile.id)?.tools ?? 0,
  }));
}

export async function list(userId: Uuid): Promise<Profile[]> {
  return decorate(userId, await data.listProfiles(userId));
}

export async function get(userId: Uuid, profileId: string): Promise<Profile> {
  assertProfileId(profileId);
  const profile = await data.findProfile(userId, profileId);
  if (!profile) throw ApiError.notFound("Profile not found.");
  const [decorated] = await decorate(userId, [profile]);
  return decorated!;
}

/**
 * Creates the user's first profile, during onboarding.
 *
 * Attaches nothing, because nothing is connected yet -- but it mints the token
 * the user copies on the last onboarding step.
 */
export async function createDefault(scope: {
  userId: Uuid;
  companyId: Uuid;
}): Promise<ProfileModel> {
  return data.insertProfile({
    user_id: scope.userId,
    company_id: scope.companyId,
    name: "Main",
    slug: "main",
    gateway_token: generateGatewayToken(),
    is_default: true,
  });
}

export async function create(
  scope: { userId: Uuid; companyId: Uuid },
  payload: unknown,
): Promise<Profile> {
  const input = nameSchema.parse(payload);

  const existing = await data.listSlugs(scope.userId);
  const slug = uniqueSlug(slugify(input.name, "profile"), new Set(existing.map((r) => r.slug)));

  const profile = await data.insertProfile({
    user_id: scope.userId,
    company_id: scope.companyId,
    name: input.name,
    slug,
    gateway_token: generateGatewayToken(),
    is_default: false,
  });

  if (input.server_ids?.length) {
    // Only attach connections this user actually owns -- the ids arrive from
    // the client and must not be trusted to be in scope.
    await setServers(scope.userId, profile.id, input.server_ids);
  }

  return get(scope.userId, profile.id);
}

export async function update(
  userId: Uuid,
  profileId: string,
  payload: unknown,
): Promise<Profile> {
  assertProfileId(profileId);
  const input = updateSchema.parse(payload);

  const profile = await data.findProfile(userId, profileId);
  if (!profile) throw ApiError.notFound("Profile not found.");

  // Exactly one default per company, enforced by a partial unique index. Clear
  // the old one first or the update trips it.
  if (input.is_default === true) {
    await data.clearDefault(userId);
  }
  if (input.is_default === false && profile.is_default) {
    throw ApiError.badRequest(
      "Pick another profile as the default rather than unsetting this one.",
    );
  }

  const patch: Partial<ProfileModel> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.is_default !== undefined) patch.is_default = input.is_default;

  await data.patchProfile(userId, profileId, patch);
  return get(userId, profileId);
}

export async function remove(userId: Uuid, profileId: string): Promise<void> {
  assertProfileId(profileId);

  const profile = await data.findProfile(userId, profileId);
  if (!profile) throw ApiError.notFound("Profile not found.");

  // Deleting the last profile would leave the company with no way to reach the
  // gateway at all, and deleting the default would leave nothing to fall back
  // to. Both are rejected rather than silently repaired.
  const all = await data.listProfiles(userId);
  if (all.length <= 1) {
    throw ApiError.badRequest("A company needs at least one profile.");
  }
  if (profile.is_default) {
    throw ApiError.badRequest("Make another profile the default before deleting this one.");
  }

  await data.deleteProfile(userId, profileId);
}

export function attachedServerIds(profileId: Uuid) {
  return data.listAttachedServerIds(profileId);
}

/**
 * Replaces a profile's attachments.
 *
 * Filters to connections the company owns, so a caller cannot attach another
 * tenant's server by guessing an id.
 */
export async function setServers(
  userId: Uuid,
  profileId: string,
  serverIds: string[],
): Promise<Profile> {
  assertProfileId(profileId);

  const profile = await data.findProfile(userId, profileId);
  if (!profile) throw ApiError.notFound("Profile not found.");

  const owned = new Set((await listServers(userId)).map((server) => server.id));
  const scoped = serverIds.filter((id): id is Uuid => isUuid(id) && owned.has(id));

  await data.setAttachedServers(profileId, scoped);
  return get(userId, profileId);
}

/** Attaches one connection. Used when a server is connected from a profile. */
export async function attach(
  userId: Uuid,
  profileId: Uuid,
  serverId: Uuid,
): Promise<void> {
  const profile = await data.findProfile(userId, profileId);
  if (!profile) throw ApiError.notFound("Profile not found.");
  await data.attachServer(profileId, serverId);
}

/** Which profiles expose each connection, for the server list. */
export async function profileIdsByServer(
  userId: Uuid,
): Promise<Map<Uuid, Uuid[]>> {
  const rows = await data.listProfileIdsByServer(userId);
  const byServer = new Map<Uuid, Uuid[]>();
  for (const row of rows) {
    byServer.set(row.server_id, [...(byServer.get(row.server_id) ?? []), row.profile_id]);
  }
  return byServer;
}

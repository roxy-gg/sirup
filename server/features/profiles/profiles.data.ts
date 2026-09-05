import { ProfileModel, McpToolModel } from "../../database/models/index.js";
import { knex } from "../../database/knex.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * DATA -- every Objection query for profiles and their attachments.
 */

export function listProfiles(companyId: Uuid) {
  return ProfileModel.query()
    .where("company_id", companyId)
    // Default first, then oldest: a stable order the switcher can rely on.
    .orderBy([
      { column: "is_default", order: "desc" },
      { column: "created_at", order: "asc" },
    ]);
}

export function findProfile(companyId: Uuid, profileId: Uuid) {
  return ProfileModel.query().findById(profileId).where("company_id", companyId);
}

export function findProfileByToken(token: string) {
  return ProfileModel.query().findOne({ gateway_token: token });
}

export function findDefaultProfile(companyId: Uuid) {
  return ProfileModel.query().findOne({ company_id: companyId, is_default: true });
}

export function listSlugs(companyId: Uuid) {
  return ProfileModel.query().where("company_id", companyId).select("slug");
}

export function insertProfile(values: Partial<ProfileModel>) {
  return ProfileModel.query().insert(values);
}

export function patchProfile(
  companyId: Uuid,
  profileId: Uuid,
  values: Partial<ProfileModel>,
) {
  return ProfileModel.query()
    .patchAndFetchById(profileId, values)
    .where("company_id", companyId);
}

export function deleteProfile(companyId: Uuid, profileId: Uuid) {
  return ProfileModel.query()
    .delete()
    .where("company_id", companyId)
    .where("id", profileId);
}

/** Clears any existing default, so the partial unique index cannot trip. */
export function clearDefault(companyId: Uuid) {
  return ProfileModel.query()
    .patch({ is_default: false })
    .where("company_id", companyId)
    .where("is_default", true);
}

export function listAttachedServerIds(profileId: Uuid): Promise<Uuid[]> {
  return knex("profile_servers")
    .where("profile_id", profileId)
    .pluck<Uuid[]>("server_id");
}

/**
 * Replaces a profile's attachments wholesale, inside one transaction so a
 * failure cannot leave a profile half-attached.
 */
export async function setAttachedServers(
  profileId: Uuid,
  serverIds: Uuid[],
): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx("profile_servers").where("profile_id", profileId).delete();
    if (serverIds.length > 0) {
      await trx("profile_servers").insert(
        serverIds.map((serverId) => ({ profile_id: profileId, server_id: serverId })),
      );
    }
  });
}

/** Attaches one connection, ignoring a repeat attach rather than erroring. */
export async function attachServer(profileId: Uuid, serverId: Uuid): Promise<void> {
  await knex("profile_servers")
    .insert({ profile_id: profileId, server_id: serverId })
    .onConflict(["profile_id", "server_id"])
    .ignore();
}

export async function detachServer(profileId: Uuid, serverId: Uuid): Promise<void> {
  await knex("profile_servers")
    .where({ profile_id: profileId, server_id: serverId })
    .delete();
}

/** Which profiles expose a given connection. Used to render the server list. */
export function listProfileIdsByServer(companyId: Uuid) {
  return knex("profile_servers as ps")
    .join("profiles as p", "p.id", "ps.profile_id")
    .where("p.company_id", companyId)
    .select<Array<{ server_id: Uuid; profile_id: Uuid }>>(
      "ps.server_id",
      "ps.profile_id",
    );
}

/**
 * Server and tool counts per profile, in one query rather than N.
 *
 * The tool count is what the profile actually exposes: only enabled tools on
 * enabled servers, which is the number the sidebar should show.
 */
export async function countsByProfile(
  companyId: Uuid,
): Promise<Map<Uuid, { servers: number; tools: number }>> {
  const rows = await knex("profiles as p")
    .leftJoin("profile_servers as ps", "ps.profile_id", "p.id")
    .leftJoin("mcp_servers as s", function join() {
      this.on("s.id", "=", "ps.server_id").andOn(
        knex.raw("s.enabled = true"),
      );
    })
    .leftJoin("mcp_tools as t", function join() {
      this.on("t.server_id", "=", "s.id").andOn(knex.raw("t.enabled = true"));
    })
    .where("p.company_id", companyId)
    .groupBy("p.id")
    .select<Array<{ id: Uuid; servers: string; tools: string }>>(
      "p.id",
      knex.raw("count(distinct ps.server_id) as servers"),
      knex.raw("count(t.id) as tools"),
    );

  return new Map(
    rows.map((row) => [
      row.id,
      { servers: Number(row.servers), tools: Number(row.tools) },
    ]),
  );
}

/** The tools a profile exposes, for the gateway's tools/list. */
export function listProfileTools(profileId: Uuid) {
  return McpToolModel.query()
    .joinRelated("server")
    .join("profile_servers as ps", "ps.server_id", "server.id")
    .where("ps.profile_id", profileId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .orderBy(["server.slug", "mcp_tools.name"]);
}

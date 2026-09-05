import crypto from "node:crypto";
import {
  OAuthClientModel,
  OAuthCodeModel,
  OAuthRequestModel,
  OAuthTokenModel,
} from "../../database/models/index.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * DATA -- every query behind the OAuth flow, plus the token primitives.
 *
 * Nothing here decides policy; it stores, finds, and hashes. The rules about
 * what a code may be exchanged for live in `oauth.provider.ts`.
 */

/* ── token primitives ──────────────────────────────────────────────────── */

/**
 * Hashes a credential for storage.
 *
 * Plain SHA-256, deliberately, where passwords get bcrypt at cost 12. The
 * difference is the input: a password is low-entropy and human-chosen, so it
 * must be made expensive to guess. These tokens are 256 bits from the CSPRNG,
 * which is not brute-forceable at any cost factor, and they are verified on
 * every single gateway request -- putting bcrypt on that path would add
 * ~100ms to every tool call to defend against nothing.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Mints a credential with a self-describing prefix.
 *
 * The prefix is not decoration: it means a leaked string is identifiable at a
 * glance in a log or a paste, and it is what lets `/mcp` tell an OAuth access
 * token apart from a profile's `sirup_` token without a database round trip.
 */
function mint(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(32).toString("hex")}`;
}

export const newAccessToken = () => mint("sirup_at");
export const newRefreshToken = () => mint("sirup_rt");
export const newAuthorizationCode = () => mint("sirup_ac");

/* ── clients ───────────────────────────────────────────────────────────── */

export function findClient(clientId: string) {
  return OAuthClientModel.query().findOne({ client_id: clientId });
}

export function insertClient(values: Partial<OAuthClientModel>) {
  return OAuthClientModel.query().insert(values);
}

/* ── authorization requests (consent in flight) ────────────────────────── */

export function insertRequest(values: Partial<OAuthRequestModel>) {
  return OAuthRequestModel.query().insert(values);
}

export function findRequest(id: Uuid) {
  return OAuthRequestModel.query().findById(id);
}

export function deleteRequest(id: Uuid) {
  return OAuthRequestModel.query().deleteById(id);
}

/* ── authorization codes ───────────────────────────────────────────────── */

export function insertCode(values: Partial<OAuthCodeModel>) {
  return OAuthCodeModel.query().insert(values);
}

export function findCodeByHash(codeHash: string) {
  return OAuthCodeModel.query().findOne({ code_hash: codeHash });
}

/**
 * Marks a code used, and reports whether this caller was the one who did it.
 *
 * The `whereNull` is the whole point: two simultaneous exchanges of the same
 * code both read an unconsumed row, but only one UPDATE matches, so exactly
 * one of them is told it won. Checking `consumed_at` in application code and
 * then updating would let both through.
 */
export async function consumeCode(id: Uuid): Promise<boolean> {
  const updated = await OAuthCodeModel.query()
    .patch({ consumed_at: new Date() })
    .where("id", id)
    .whereNull("consumed_at");

  return updated === 1;
}

/* ── tokens ────────────────────────────────────────────────────────────── */

export function insertToken(values: Partial<OAuthTokenModel>) {
  return OAuthTokenModel.query().insert(values);
}

/** Resolves an access token, with the profile it was granted against. */
export function findTokenByHash(tokenHash: string) {
  return OAuthTokenModel.query()
    .findOne({ token_hash: tokenHash })
    .withGraphFetched("profile");
}

/** Revokes one token. Idempotent: revoking an already-revoked token is a no-op. */
export function revokeToken(id: Uuid) {
  return OAuthTokenModel.query()
    .patch({ revoked_at: new Date() })
    .where("id", id)
    .whereNull("revoked_at");
}

/**
 * Revokes every token descended from one authorization.
 *
 * Called when a refresh token is replayed. A legitimate client never presents
 * a rotated-away token, so a replay means either the token leaked or the
 * client is confused -- and in the first case the attacker may already hold a
 * newer one. Killing the family is the only response that closes both.
 */
export function revokeFamily(familyId: Uuid) {
  return OAuthTokenModel.query()
    .patch({ revoked_at: new Date() })
    .where("family_id", familyId)
    .whereNull("revoked_at");
}

/** Everything a user has authorized, for the "Connected apps" list. */
export function listUserTokens(userId: Uuid) {
  return OAuthTokenModel.query()
    .where("user_id", userId)
    .where("kind", "access")
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .withGraphFetched("[client, profile]")
    .orderBy("created_at", "desc");
}

/** Revokes every token a client holds for a user. Used by "Disconnect". */
export function revokeClientForUser(userId: Uuid, clientId: string) {
  return OAuthTokenModel.query()
    .patch({ revoked_at: new Date() })
    .where("user_id", userId)
    .where("client_id", clientId)
    .whereNull("revoked_at");
}

/**
 * Clears expired rows.
 *
 * Codes and requests are short-lived and worthless once past their expiry, so
 * they go entirely. Tokens are kept for a grace period after expiry so that
 * "which apps did I connect" stays answerable for a little while.
 */
export async function purgeExpired(): Promise<void> {
  const now = new Date();
  const grace = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  await OAuthRequestModel.query().delete().where("expires_at", "<", now);
  await OAuthCodeModel.query().delete().where("expires_at", "<", now);
  await OAuthTokenModel.query().delete().where("expires_at", "<", grace);
}

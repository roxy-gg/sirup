import type { Uuid } from "../../shared/domain.js";

/** Matches a canonical UUID, as used for every primary key. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Narrows an unknown value to a Uuid.
 *
 * Postgres rejects a malformed uuid with a 22P02 error, which would surface as
 * an opaque 500, so callers validate the shape before it reaches a query.
 */
export function isUuid(value: unknown): value is Uuid {
  return typeof value === "string" && UUID_RE.test(value);
}

import type { Uuid } from "@shared/domain";

/** Matches a canonical UUID, as used for every id in the API. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is Uuid {
  return typeof value === "string" && UUID_RE.test(value);
}

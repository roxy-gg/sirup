import { Model, raw } from "objection";
import type { IsoDateTime, Uuid } from "../../../shared/domain.js";

/**
 * Shared base for every model.
 *
 * Timestamps are written as `now()` evaluated by Postgres rather than by the
 * app clock. That matters because the logs feed is keyset-paginated on
 * `created_at`: if rows were stamped with app time, clock skew between the app
 * container and the database could reorder the feed or drop rows across a page
 * boundary.
 *
 * `raw` comes from Objection rather than the knex instance, which keeps this
 * module free of a circular import back to the database bootstrap.
 */
export class BaseModel extends Model {
  id!: Uuid;
  created_at!: Date;
  updated_at!: Date;

  static override get idColumn(): string {
    return "id";
  }

  override $beforeInsert(): void {
    // The column types are Date because that is what the pg driver returns on
    // read; on write Objection accepts a raw SQL fragment in the same slot.
    this.created_at = this.created_at ?? (raw("now()") as unknown as Date);
    this.updated_at = raw("now()") as unknown as Date;
  }

  override $beforeUpdate(): void {
    this.updated_at = raw("now()") as unknown as Date;
  }
}

/**
 * Converts a database timestamp to the ISO string the API contract declares.
 *
 * The pg driver returns `timestamptz` as a Date, but everything crossing the
 * wire is JSON, so the two representations must not be confused -- that exact
 * mix-up silently disabled the upstream connection pool once already.
 */
export function toIso(value: Date | string | null | undefined): IsoDateTime | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

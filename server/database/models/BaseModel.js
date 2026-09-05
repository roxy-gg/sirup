import { Model, raw } from "objection";

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
  $beforeInsert() {
    this.created_at = this.created_at || raw("now()");
    this.updated_at = raw("now()");
  }

  $beforeUpdate() {
    this.updated_at = raw("now()");
  }
}

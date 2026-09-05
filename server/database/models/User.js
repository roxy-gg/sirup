import { BaseModel } from "./BaseModel.js";
import { Company } from "./Company.js";

export class User extends BaseModel {
  static get tableName() {
    return "users";
  }

  /** Never let the password hash escape into an API response. */
  $formatJson(json) {
    const formatted = super.$formatJson(json);
    delete formatted.password_hash;
    return formatted;
  }

  static get relationMappings() {
    return {
      company: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: Company,
        join: { from: "users.company_id", to: "companies.id" },
      },
    };
  }
}

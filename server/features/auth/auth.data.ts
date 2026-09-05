import { CompanyModel, UserModel } from "../../database/models/index.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * DATA -- every Objection query for auth lives here. No business rules, no
 * hashing, no HTTP: just reads and writes.
 */

export function findUserByEmail(email: string) {
  return UserModel.query().findOne({ email });
}

export function findUserById(id: Uuid) {
  return UserModel.query().findById(id);
}

export function findUserWithCompany(id: Uuid) {
  return UserModel.query().findById(id).withGraphFetched("company");
}

export function insertUser(input: { email: string; passwordHash: string }) {
  return UserModel.query().insert({
    email: input.email,
    password_hash: input.passwordHash,
  });
}

export function findCompanyBySlug(slug: string) {
  return CompanyModel.query().findOne({ slug });
}

export function insertCompany(input: {
  name: string;
  slug: string;
  gatewayToken: string;
}) {
  return CompanyModel.query().insert({
    name: input.name,
    slug: input.slug,
    gateway_token: input.gatewayToken,
  });
}

export function attachUserToCompany(userId: Uuid, companyId: Uuid) {
  return UserModel.query().patchAndFetchById(userId, { company_id: companyId });
}

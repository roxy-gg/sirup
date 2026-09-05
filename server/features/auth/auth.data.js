import { User, Company } from "../../database/models/index.js";

/**
 * DATA -- every Objection query for auth lives here. No business rules, no
 * hashing, no HTTP: just reads and writes.
 */

export function findUserByEmail(email) {
  return User.query().findOne({ email });
}

export function findUserById(id) {
  return User.query().findById(id);
}

export function findUserWithCompany(id) {
  return User.query().findById(id).withGraphFetched("company");
}

export function insertUser({ email, passwordHash }) {
  return User.query().insert({ email, password_hash: passwordHash });
}

export function findCompanyBySlug(slug) {
  return Company.query().findOne({ slug });
}

export function insertCompany({ name, slug, gatewayToken }) {
  return Company.query().insert({
    name,
    slug,
    gateway_token: gatewayToken,
  });
}

export function attachUserToCompany(userId, companyId) {
  return User.query().patchAndFetchById(userId, { company_id: companyId });
}

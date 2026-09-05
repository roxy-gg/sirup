import { api } from "@/lib/api";

/**
 * DATA -- every auth request the app can make, and nothing else.
 *
 * @typedef {{ id: string, email: string }} User
 * @typedef {{ id: string, name: string, slug: string, gateway_token: string }} Company
 * @typedef {{ user: User | null, company: Company | null }} Session
 */

/** @returns {Promise<Session>} */
export function fetchSession() {
  return api.get("/auth/session");
}

/** @returns {Promise<Session>} */
export function register(email, password) {
  return api.post("/auth/register", { email, password });
}

/** @returns {Promise<Session>} */
export function login(email, password) {
  return api.post("/auth/login", { email, password });
}

/** @returns {Promise<Session>} */
export function createCompany(name) {
  return api.post("/auth/company", { name });
}

export function logout() {
  return api.delete("/auth/session");
}

import { api } from "@/lib/api";
import type { CredentialsBody, SessionResponse } from "@shared/api";

/**
 * DATA -- every auth request the app can make, and nothing else.
 *
 * Response shapes come from the shared API contract, so a change on the server
 * surfaces here as a compile error rather than at runtime.
 */

export function fetchSession(): Promise<SessionResponse> {
  return api.get<SessionResponse>("/auth/session");
}

export function register(email: string, password: string): Promise<SessionResponse> {
  return api.post<SessionResponse>("/auth/register", {
    email,
    password,
  } satisfies CredentialsBody);
}

export function login(email: string, password: string): Promise<SessionResponse> {
  return api.post<SessionResponse>("/auth/login", {
    email,
    password,
  } satisfies CredentialsBody);
}

export function createCompany(name: string): Promise<SessionResponse> {
  return api.post<SessionResponse>("/auth/company", { name });
}

export function logout(): Promise<void> {
  return api.delete("/auth/session");
}

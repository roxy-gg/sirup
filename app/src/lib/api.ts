import type { ApiErrorBody } from "@shared/api";

/**
 * The single place the frontend talks to the backend.
 *
 * Every feature's `data/` layer calls through here, so auth handling, error
 * shaping, and JSON parsing are defined once rather than per request. Each
 * method is generic over the response type, and callers pass the shape declared
 * in `shared/api.ts` -- so a route that changes its payload breaks the build.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly field: string | undefined;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<TResponse>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<TResponse> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    // Session lives in an httpOnly cookie, so it must ride along.
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as TResponse;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(
      response.status,
      error.error || "Something went wrong.",
      error.field,
    );
  }

  return payload as TResponse;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};

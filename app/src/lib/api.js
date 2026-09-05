/**
 * The single place the frontend talks to the backend.
 *
 * Every feature's `data/` layer calls through here, so auth handling, error
 * shaping, and JSON parsing are defined once rather than per request.
 */

export class ApiError extends Error {
  constructor(status, message, field) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
  }
}

async function request(method, path, body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    // Session lives in an httpOnly cookie, so it must ride along.
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error || "Something went wrong.",
      payload?.field,
    );
  }

  return payload;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  patch: (path, body) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};

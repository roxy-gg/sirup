/**
 * Errors that are safe to show a user. Anything thrown that is *not* an
 * ApiError gets flattened to a generic 500 by the error middleware, so we never
 * leak stack traces or driver messages to the client.
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Not authenticated.") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Not allowed.") {
    return new ApiError(403, message);
  }

  static notFound(message = "Not found.") {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }
}

/**
 * Wraps an async route handler so rejected promises reach Express's error
 * middleware instead of hanging the request.
 */
export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

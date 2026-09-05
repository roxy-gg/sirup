import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Errors that are safe to show a user. Anything thrown that is *not* an
 * ApiError gets flattened to a generic 500 by the error middleware, so we never
 * leak stack traces or driver messages to the client.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Not authenticated."): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = "Not allowed."): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = "Not found."): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }
}

/**
 * Wraps an async handler so rejected promises reach Express's error middleware
 * instead of hanging the request.
 *
 * Express 4 does not await handlers, so an un-wrapped async function that
 * throws leaves the client waiting forever and can take the process down.
 */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

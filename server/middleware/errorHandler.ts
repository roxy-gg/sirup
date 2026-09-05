import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../shared/errors.js";

/** Shape of a driver error that carries a SQLSTATE code. */
interface SqlError {
  code?: string;
  nativeError?: { code?: string };
}

/**
 * Single place where an exception becomes an HTTP response.
 *
 * Anything that isn't an ApiError or a ZodError is treated as a bug: we log it
 * with its stack for ourselves and return a generic message to the client, so
 * driver errors and stack traces never reach the browser.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    res.status(400).json({
      error: first?.message ?? "Invalid request.",
      field: first?.path?.join("."),
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  // Postgres surfaces these as SQLSTATE codes, which are stable across
  // versions and locales -- unlike the human-readable message text.
  //
  // Objection wraps driver errors in a DBError, so the code may be one level
  // down on `nativeError` depending on where the query was issued.
  const sqlError = error as SqlError;
  const sqlState = sqlError?.code ?? sqlError?.nativeError?.code;

  switch (sqlState) {
    case "23505": // unique_violation
      res.status(409).json({ error: "That record already exists." });
      return;
    case "23503": // foreign_key_violation
      res.status(409).json({ error: "That record is still referenced." });
      return;
    case "22P02": // invalid_text_representation, e.g. a malformed uuid
      res.status(400).json({ error: "Malformed identifier." });
      return;
    default:
      break;
  }

  console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({ error: "Something went wrong on our end." });
};

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Endpoint not found." });
}

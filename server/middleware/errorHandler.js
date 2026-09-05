import { ApiError } from "../shared/errors.js";
import { ZodError } from "zod";

/**
 * Single place where an exception becomes an HTTP response.
 *
 * Anything that isn't an ApiError or a ZodError is treated as a bug: we log it
 * with its stack for ourselves and return a generic message to the client, so
 * driver errors and stack traces never reach the browser.
 */
// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
export function errorHandler(error, req, res, next) {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return res.status(400).json({
      error: first?.message || "Invalid request.",
      field: first?.path?.join("."),
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  // Postgres surfaces these as SQLSTATE codes, which are stable across
  // versions and locales -- unlike the human-readable message text.
  //
  // Objection wraps driver errors in a DBError, so the code may be one level
  // down on `nativeError` depending on where the query was issued.
  const sqlState = error.code || error.nativeError?.code;

  switch (sqlState) {
    case "23505": // unique_violation
      return res.status(409).json({ error: "That record already exists." });
    case "23503": // foreign_key_violation
      return res.status(409).json({ error: "That record is still referenced." });
    case "22P02": // invalid_text_representation, e.g. a malformed uuid
      return res.status(400).json({ error: "Malformed identifier." });
    default:
      break;
  }

  console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  return res.status(500).json({ error: "Something went wrong on our end." });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Endpoint not found." });
}

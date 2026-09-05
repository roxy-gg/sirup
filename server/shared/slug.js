import crypto from "node:crypto";

/**
 * Turns a display name into a tool-name-safe prefix. MCP tool names should stay
 * within [a-z0-9_-], and we join them with "__", so the slug must never contain
 * that separator itself.
 */
export function slugify(input, fallback = "server") {
  const slug = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 32);

  return slug || fallback;
}

/**
 * Finds a slug not already taken within the company. `taken` is a Set of
 * existing slugs.
 */
export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

/** The credential a client presents to the aggregated MCP endpoint. */
export function generateGatewayToken() {
  return `sirup_${crypto.randomBytes(24).toString("hex")}`;
}

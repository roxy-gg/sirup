/** Verifies every catalog icon slug resolves in simple-icons. */
import fs from "node:fs";
import * as si from "simple-icons";
import { Checks } from "./_harness.js";
import { listCatalog } from "../server/features/mcp-catalog/mcpCatalog.data.js";

const t = new Checks("Catalog integrity");

const catalog = listCatalog();
t.check("catalog has a useful number of apps", catalog.length >= 40, catalog.length);

// A broken slug renders an empty box, which looks like a bug to a user.
const icons = catalog.map((entry) => entry.icon).filter((s): s is string => Boolean(s));
const broken = icons.filter((slug) => {
  const key = `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
  return !(key in si);
});
t.check(
  "every icon slug resolves in simple-icons",
  broken.length === 0,
  broken.length ? broken.join(", ") : `${icons.length} icons`,
);

// Duplicate keys would collide in React lists and in the connected-set lookup.
const keys = catalog.map((entry) => entry.key);
t.check("keys are unique", new Set(keys).size === keys.length, keys.length);

// Every entry except the custom escape hatch must carry a real endpoint.
const missingUrl = catalog.filter((entry) => entry.key !== "custom" && !entry.url);
t.check("every app has an endpoint URL", missingUrl.length === 0, missingUrl.length);

// An https URL is required -- the connect form rejects anything else anyway.
const badUrl = catalog.filter((entry) => entry.url && !entry.url.startsWith("https://"));
t.check("all endpoints are https", badUrl.length === 0, badUrl.map((e) => e.key).join(", "));

// A "header" entry without a header name cannot actually authenticate.
const badHeader = catalog.filter(
  (entry) => entry.auth_type === "header" && !entry.auth_header_name,
);
t.check(
  "custom-header apps name their header",
  badHeader.length === 0,
  badHeader.map((e) => e.key).join(", "),
);

// OAuth entries must not preselect a credential field the user cannot fill.
const badOauth = catalog.filter(
  (entry) => entry.auth === "oauth" && entry.auth_type !== "none",
);
t.check(
  "oauth apps do not ask for a static credential",
  badOauth.length === 0,
  badOauth.map((e) => e.key).join(", "),
);

const connectable = catalog.filter((entry) => entry.auth !== "oauth").length;
console.log(
  `\n  ${connectable} connectable today, ${catalog.length - connectable} awaiting OAuth\n`,
);

// The frontend renders icons from a generated map; keep it in sync.
const mapPath = "app/src/lib/brandIcons.ts";
if (fs.existsSync(mapPath)) {
  const map = fs.readFileSync(mapPath, "utf8");
  const missing = icons.filter((slug) => !map.includes(`"${slug}"`));
  t.check(
    "brandIcons.ts covers every catalog icon",
    missing.length === 0,
    missing.join(", "),
  );
}

t.finish();

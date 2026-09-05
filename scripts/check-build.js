/**
 * Static checks that must pass before a deploy.
 *
 * These catch the class of bug that only surfaces at build or container-start
 * time -- exactly the kind that turns into a failed Dokploy deployment rather
 * than a local test failure.
 *
 * Usage: node scripts/check-build.js
 */
import fs from "node:fs";
import path from "node:path";

let failures = 0;

function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
}

function walk(dir, extensions, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, found);
    else if (extensions.some((ext) => entry.name.endsWith(ext))) found.push(full);
  }
  return found;
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);

console.log(`\nBuild + deploy preflight\n${"-".repeat(56)}`);

// --- every bare import must resolve to a declared dependency ---
// A stray import like `from "cn"` builds fine while the bogus package is
// installed, then breaks the moment it is removed -- or in a clean CI install.
const appFiles = walk("app/src", [".js", ".jsx"]);
const serverFiles = walk("server", [".js"]);

const unresolved = [];
for (const file of [...appFiles, ...serverFiles]) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/from\s+["']([^"'.@/][^"']*|@[^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier.startsWith("node:")) continue;
    // "@/..." is the Vite path alias for app/src, not a scoped package.
    if (specifier.startsWith("@/")) continue;
    // Scoped and sub-path imports resolve against their package root.
    const root = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    if (!declared.has(root)) unresolved.push(`${file} -> ${specifier}`);
  }
}
check("every bare import maps to a declared dependency", unresolved.length === 0,
  unresolved.slice(0, 5).join("; "));

// --- server imports must be runtime-resolvable under plain Node ESM ---
// Vite resolves extensionless imports; Node does not. A missing ".js" works in
// dev and crashes the container on boot.
const missingExt = [];
for (const file of serverFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    if (!match[1].endsWith(".js")) missingExt.push(`${file} -> ${match[1]}`);
  }
}
check("server relative imports carry explicit .js extensions",
  missingExt.length === 0, missingExt.slice(0, 5).join("; "));

// --- the Dockerfile must copy everything the server needs ---
const dockerfile = fs.readFileSync("Dockerfile", "utf8");
for (const required of ["server", "knexfile.js", "dist"]) {
  check(`Dockerfile copies ${required}`, dockerfile.includes(required));
}

check("Dockerfile pins PORT so the healthcheck matches the app",
  /^ENV PORT=(\d+)/m.test(dockerfile) &&
    dockerfile.match(/^ENV PORT=(\d+)/m)[1] ===
      dockerfile.match(/PORT\|\|(\d+)/)?.[1],
  `ENV=${dockerfile.match(/^ENV PORT=(\d+)/m)?.[1]} healthcheck=${dockerfile.match(/PORT\|\|(\d+)/)?.[1]}`);

// --- no dev-only helper files left in the served output ---
check("no dev helper pages in app/public",
  !fs.existsSync("app/public") ||
    fs.readdirSync("app/public").every((f) => !f.startsWith("dev-")),
  fs.existsSync("app/public") ? fs.readdirSync("app/public").join(", ") : "no public dir");

// --- compose must not publish the database to the host ---
const compose = fs.readFileSync("docker-compose.yml", "utf8");
const dbSection = compose.slice(compose.indexOf("db:"), compose.indexOf("app:"));
check("production compose does not publish the database port",
  !/^\s+ports:/m.test(dbSection));

check("production compose requires a JWT_SECRET", compose.includes("JWT_SECRET:?"));
check("production compose requires a POSTGRES_PASSWORD",
  compose.includes("POSTGRES_PASSWORD:?"));
check("database uses a named volume so Dokploy can back it up",
  /volumes:\s*\n\s+sirup_db_data:/.test(compose));
// A composed URL breaks on a password containing / # or @.
check("compose passes discrete PG* vars rather than a composed URL",
  compose.includes("PGPASSWORD:") && !compose.includes("DATABASE_URL: postgres://"));

// --- no SQLite remnants ---
const allSource = [...appFiles, ...serverFiles, "knexfile.js"]
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");
check("no sqlite driver references remain",
  !/better-sqlite3|sqlite3/.test(allSource));
check("sqlite is not a declared dependency", !declared.has("better-sqlite3"));

console.log("-".repeat(56));
console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);

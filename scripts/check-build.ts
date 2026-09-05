/**
 * Static checks that must pass before a deploy.
 *
 * These catch the class of bug that only surfaces at build or container-start
 * time -- exactly the kind that turns into a failed Dokploy deployment rather
 * than a local test failure.
 *
 * Usage: npm run check:build
 */
import fs from "node:fs";
import path from "node:path";
import { Checks } from "./_harness.js";

const t = new Checks("Build + deploy preflight");

function walk(dir: string, extensions: string[], found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, found);
    else if (extensions.some((ext) => entry.name.endsWith(ext))) found.push(full);
  }
  return found;
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

const appFiles = walk("app/src", [".ts", ".tsx"]);
const serverFiles = walk("server", [".ts"]);
const sharedFiles = walk("shared", [".ts"]);

// --- every bare import must resolve to a declared dependency ---
// A stray import like `from "cn"` builds fine while the bogus package is
// installed, then breaks the moment it is removed -- or in a clean CI install.
const unresolved: string[] = [];
for (const file of [...appFiles, ...serverFiles, ...sharedFiles]) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/from\s+["']([^"'.@/][^"']*|@[^"']+)["']/g)) {
    const specifier = match[1]!;
    if (specifier.startsWith("node:")) continue;
    // "@/..." and "@shared/..." are path aliases, not scoped packages.
    if (specifier.startsWith("@/") || specifier.startsWith("@shared/")) continue;
    const root = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0]!;
    if (!declared.has(root)) unresolved.push(`${file} -> ${specifier}`);
  }
}
t.check(
  "every bare import maps to a declared dependency",
  unresolved.length === 0,
  unresolved.slice(0, 5).join("; "),
);

// --- server imports must be runtime-resolvable under Node ESM ---
// tsx and Node both need the ".js" extension on relative ESM imports, even
// though the file on disk is ".ts". A missing extension crashes on boot.
const missingExt: string[] = [];
for (const file of [...serverFiles, ...sharedFiles]) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    if (!match[1]!.endsWith(".js")) missingExt.push(`${file} -> ${match[1]}`);
  }
}
t.check(
  "server relative imports carry explicit .js extensions",
  missingExt.length === 0,
  missingExt.slice(0, 5).join("; "),
);

// --- no stray JavaScript left over from the TypeScript migration ---
const strayJs = [
  ...walk("app/src", [".js", ".jsx"]),
  ...walk("server", [".jsx"]),
  ...walk("shared", [".js"]),
];
t.check(
  "no stray .js/.jsx files outside migrations",
  strayJs.length === 0,
  strayJs.slice(0, 5).join("; "),
);

// Migrations stay .js on purpose: knex loads them at runtime with no TS loader.
const migrations = fs.readdirSync("server/database/migrations");
t.check(
  "migrations are plain .js so knex can load them",
  migrations.length > 0 && migrations.every((file) => file.endsWith(".js")),
  migrations.join(", "),
);

// --- the Dockerfile must copy everything the server needs ---
const dockerfile = fs.readFileSync("Dockerfile", "utf8");
for (const required of ["server", "shared", "knexfile.ts", "dist", "tsconfig"]) {
  t.check(`Dockerfile copies ${required}`, dockerfile.includes(required));
}

t.check(
  "Dockerfile pins PORT so the healthcheck matches the app",
  /^ENV PORT=(\d+)/m.test(dockerfile) &&
    dockerfile.match(/^ENV PORT=(\d+)/m)?.[1] === dockerfile.match(/PORT\|\|(\d+)/)?.[1],
  `ENV=${dockerfile.match(/^ENV PORT=(\d+)/m)?.[1]} healthcheck=${
    dockerfile.match(/PORT\|\|(\d+)/)?.[1]
  }`,
);

// tsx runs the TypeScript server directly, so it must survive --omit=dev.
t.check(
  "tsx is a runtime dependency, not a dev dependency",
  Boolean(pkg.dependencies?.tsx),
  pkg.dependencies?.tsx ?? "MISSING",
);

// `npm run build` runs `tsc -b`, which type-checks the scripts project too.
// Excluding scripts/ from the build context would fail the image build.
const dockerignore = fs.readFileSync(".dockerignore", "utf8");
const ignored = dockerignore
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
t.check(
  "scripts/ and shared/ stay in the Docker build context",
  !ignored.includes("scripts") && !ignored.includes("shared"),
  ignored.filter((entry) => entry === "scripts" || entry === "shared").join(", ") ||
    "neither excluded",
);

// --- no dev-only helper files left in the served output ---
t.check(
  "no dev helper pages in app/public",
  !fs.existsSync("app/public") ||
    fs.readdirSync("app/public").every((file) => !file.startsWith("dev-")),
  fs.existsSync("app/public") ? fs.readdirSync("app/public").join(", ") : "no public dir",
);

// --- compose must not publish the database to the host ---
const compose = fs.readFileSync("docker-compose.yml", "utf8");
const dbSection = compose.slice(compose.indexOf("db:"), compose.indexOf("app:"));
t.check(
  "production compose does not publish the database port",
  !/^\s+ports:/m.test(dbSection),
);

t.check("production compose requires a JWT_SECRET", compose.includes("JWT_SECRET:?"));
t.check(
  "production compose requires a POSTGRES_PASSWORD",
  compose.includes("POSTGRES_PASSWORD:?"),
);
t.check(
  "database uses a named volume so Dokploy can back it up",
  /volumes:\s*\n\s+sirup_db_data:/.test(compose),
);
// A composed URL breaks on a password containing / # or @.
t.check(
  "compose passes discrete PG* vars rather than a composed URL",
  compose.includes("PGPASSWORD:") && !compose.includes("DATABASE_URL: postgres://"),
);

// --- no SQLite remnants ---
const allSource = [...appFiles, ...serverFiles, ...sharedFiles, "knexfile.ts"]
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
t.check("no sqlite driver references remain", !/better-sqlite3|sqlite3/.test(allSource));
t.check("sqlite is not a declared dependency", !declared.has("better-sqlite3"));

t.finish();

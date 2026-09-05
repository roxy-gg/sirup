/**
 * Dev runner: starts the server and restarts it when server code changes.
 *
 * `tsx watch` cannot be used here. It watches every file the process loads, and
 * this process embeds Vite -- which writes to `node_modules/.vite` as it
 * optimises dependencies. Those writes retrigger the watcher, so the server
 * restart-loops and never finishes booting.
 *
 * This watches only the directories we actually author, and leaves frontend
 * reloading to Vite's own HMR, which is already running inside the child.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watched = ["server", "shared"].map((dir) => path.join(rootDir, dir));
const entry = path.join(rootDir, "server", "index.ts");

let child: ChildProcess | null = null;
let restarting = false;

function start(): void {
  child = spawn("node", ["--import", "tsx", entry], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });

  child.on("exit", (code) => {
    // A crash while idle should surface; a restart is expected and silent.
    if (!restarting && code !== null && code !== 0) {
      console.log(`\n[dev] server exited with code ${code}. Waiting for changes…`);
    }
  });
}

function restart(file: string): void {
  if (restarting) return;
  restarting = true;

  console.log(`\n[dev] ${path.relative(rootDir, file)} changed — restarting…`);
  child?.kill();

  // A brief settle window coalesces the burst of events an editor emits on
  // save, so one save produces one restart.
  setTimeout(() => {
    restarting = false;
    start();
  }, 120);
}

for (const dir of watched) {
  if (!fs.existsSync(dir)) continue;
  fs.watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (!filename.endsWith(".ts")) return;
    restart(path.join(dir, filename));
  });
}

process.on("SIGINT", () => {
  child?.kill();
  process.exit(0);
});

console.log("[dev] watching server/ and shared/ …");
start();

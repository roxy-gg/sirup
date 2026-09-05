import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// The React app lives in `app/`. Express owns the HTTP server in both dev and
// prod, so Vite never listens on its own port -- it runs as middleware.
export default defineConfig({
  root: path.join(rootDir, "app"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(rootDir, "app", "src"),
      // The API contract lives outside app/, so it needs an explicit alias.
      "@shared": path.join(rootDir, "shared"),
    },
  },
  build: {
    outDir: path.join(rootDir, "dist"),
    emptyOutDir: true,
  },
});

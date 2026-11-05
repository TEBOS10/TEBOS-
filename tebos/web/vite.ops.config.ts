// Tidy Property Operations (ADR 0023): its own web app from the same code base, with its own entry (ops/index.html),
// public files, output (dist-ops) and deployment. It shares the domain rules and the database; its accounts are its own.
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./ops", import.meta.url)),
  publicDir: fileURLToPath(new URL("./ops/public", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: fileURLToPath(new URL("./node_modules/.vite-ops", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../src/domain", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  build: { outDir: fileURLToPath(new URL("./dist-ops", import.meta.url)), emptyOutDir: true },
});

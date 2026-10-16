import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// TEPOS: a separate web app from the same code base. Its own entry (tepos/index.html), its own public files
// (the earthy logo), its own output (dist-tepos), its own deployment. TEBOS's build never includes it.
export default defineConfig({
  root: fileURLToPath(new URL("./tepos", import.meta.url)),
  publicDir: fileURLToPath(new URL("./tepos/public", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  // its own dependency cache, so running both dev servers at once never invalidates TEBOS's
  cacheDir: fileURLToPath(new URL("./node_modules/.vite-tepos", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../src/domain", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  build: { outDir: fileURLToPath(new URL("./dist-tepos", import.meta.url)), emptyOutDir: true },
});

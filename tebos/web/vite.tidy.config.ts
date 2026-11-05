import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Tidy Enterprise's public website (ADR 0022): its own web app from the same code base. Its own entry
// (tidy/index.html), its own public files, its own output (dist-tidy) and its own deployment. It talks to TEBOS's
// enquiries only as the public does; neither TEBOS's, TEPOS's nor the property platform's build includes it.
export default defineConfig({
  root: fileURLToPath(new URL("./tidy", import.meta.url)),
  publicDir: fileURLToPath(new URL("./tidy/public", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: fileURLToPath(new URL("./node_modules/.vite-tidy", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../src/domain", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  build: { outDir: fileURLToPath(new URL("./dist-tidy", import.meta.url)), emptyOutDir: true },
});

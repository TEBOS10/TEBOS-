import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Grape Studios' booking site (ADR 0016): a client's own web app from the same code base. Its own entry
// (grape/index.html), its own public files, its own output (dist-grape) and its own deployment. It talks to TEBOS's
// bookings only as the public does; neither TEBOS's, TEPOS's nor the property platform's build includes it.
export default defineConfig({
  root: fileURLToPath(new URL("./grape", import.meta.url)),
  publicDir: fileURLToPath(new URL("./grape/public", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: fileURLToPath(new URL("./node_modules/.vite-grape", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../src/domain", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  build: { outDir: fileURLToPath(new URL("./dist-grape", import.meta.url)), emptyOutDir: true },
});

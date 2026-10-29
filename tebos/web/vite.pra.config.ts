import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The Property Revenue Architect Platform: its own web app from the same code base. Its own entry (pra/index.html),
// its own public files, its own output (dist-pra), its own deployment. Neither TEBOS's nor TEPOS's build includes it.
export default defineConfig({
  root: fileURLToPath(new URL("./pra", import.meta.url)),
  publicDir: fileURLToPath(new URL("./pra/public", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: fileURLToPath(new URL("./node_modules/.vite-pra", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../src/domain", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  build: { outDir: fileURLToPath(new URL("./dist-pra", import.meta.url)), emptyOutDir: true },
});

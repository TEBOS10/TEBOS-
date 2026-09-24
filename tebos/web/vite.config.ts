import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// @core points at the TEBOS domain layer (../src/domain), so the interface
// explains and pre-checks rules with the same code the workers use. Only
// browser-safe modules (src/domain) may be imported from here.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../src/domain", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
});

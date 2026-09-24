import { defineConfig } from "vitest/config";

// The core package's tests only; the web app (web/) has its own runner and config.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });

import { defineConfig } from "@playwright/test";

// The app runs unmodified; e2e/fake-supabase.ts stands in for the Supabase
// HTTP API at the network layer with fictional fixture data.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5174",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  webServer: {
    command: "npx vite --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: "https://fixture.supabase.test", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" },
  },
});

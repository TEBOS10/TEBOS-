import { defineConfig } from "@playwright/test";

// The app runs unmodified; e2e/fake-supabase.ts stands in for the Supabase
// HTTP API at the network layer with fictional fixture data.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // on CI each failing test is reported as an annotation on the pull request, readable without the log
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:5174",
    viewport: { width: 1440, height: 1000 },
    // a failing test keeps its trace (test-results/), so an intermittent failure leaves its cause behind
    trace: "retain-on-failure",
    // the 3D specs (glance, world) switch on Chromium's software WebGL for themselves; applied to every
    // browser it destabilised the CI runner's headless shell, so it stays per file
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  // TEBOS on 5174; TEPOS, the separate personal app, on 5175 (its specs set their own baseURL)
  webServer: [
    {
      command: "npx vite --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: "https://fixture.supabase.test", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" },
    },
    {
      command: "npx vite --config vite.tepos.config.ts --port 5175 --strictPort",
      url: "http://localhost:5175",
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: "https://fixture.supabase.test", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" },
    },
  ],
});

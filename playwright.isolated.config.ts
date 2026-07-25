import { defineConfig, devices } from "@playwright/test";

// Browser suite on its own port, always against a build it made itself.
//
// The default config sets `reuseExistingServer: !process.env.CI`, so a `pnpm start` left
// running on port 3000 is silently reused and the whole suite tests whatever build that
// server booted with. That produced four consecutive misleading runs during the parser
// work — identical failures against code that no longer existed (GOTCHAS). This config
// exists so a browser run can never be poisoned that way, and so it does not require
// whoever is driving the app by hand to shut it down first.
//
// `playwright.config.ts` stays as it is: it is one of the intentionally uncommitted
// local config files, and the default port remains the convenient one for manual use.
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } }
  ]
});

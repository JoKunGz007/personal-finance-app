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
  // Both owner specs need the development sign-in route, which answers 404 unless the
  // server was built with NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1 — the guard working as
  // intended. They run under `playwright.owner.config.ts`, which sets it.
  //
  // `owner-access.spec.ts` was added on 2026-08-10 and this list had to grow with it: left
  // out, it was collected here, failed four times over (two tests × two projects) and
  // reported `"Not Found" is not valid JSON` — the 404 body, parsed as the session it
  // expected. A pattern naming one file is a list of one, not a rule.
  //
  // **So it is a rule now.** `owner-phone-audit.spec.ts` (2026-08-29, PLAN task 51) would have
  // been the third file to learn this the same way. The prefix is the contract every config here
  // keys off: `playwright.owner.config.ts` collects `owner-*` and the other two exclude it.
  testIgnore: /owner-.*\.spec\.ts/u,
  fullyParallel: true,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    // Pinned, not inherited, for the same reason `playwright.owner.config.ts` pins —
    // and this config needed it just as badly. `NEXT_PUBLIC_*` are inlined by the
    // `pnpm build` above, and since D-048 `.env.local` points at `private-ledger-live`,
    // so without these four an ordinary browser run builds against real financial
    // records. These are the local CLI's fixed defaults for the test project.
    //
    // The flag is pinned to "0" deliberately: `ledger.spec.ts` asserts that a build
    // which did not opt in renders no development sign-in, and `.env.local` now sets
    // it to 1 permanently for manual use. Inherited, that test fails on a false
    // premise rather than on a defect (GOTCHAS).
    env: {
      NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "0",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
      OWNER_GOOGLE_EMAIL: "synthetic.owner@example.invalid",
      // Pinned empty for the same reason as the owner config: `next start` inherits the key from
      // the owner's Windows user environment, and no browser run should reach a third party
      // because of whose machine it is on (D-129). No spec here drives a reader today; this is
      // what stops one added later from calling out by accident.
      GOOGLE_VISION_KEY: "",
      // The statement mailbox, on exactly the reasoning above and reachable from here: both
      // `parser.spec.ts` and `statement-pdf.spec.ts` drive `/import`, which renders
      // `.sync-controls`, and `next start` inherits the owner's real Gmail, IMAP app password and
      // sender list from `.env.local`. An empty password reads as **missing** to
      // `lib/server/statement-mailbox-session.ts`, so the session fails closed rather than trying
      // an anonymous connection. All three, because a half-pinned mailbox is a configuration that
      // exists nowhere else.
      STATEMENT_MAILBOX_USER: "",
      STATEMENT_MAILBOX_APP_PASSWORD: "",
      STATEMENT_MAILBOX_SENDERS: ""
    }
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } }
  ]
});

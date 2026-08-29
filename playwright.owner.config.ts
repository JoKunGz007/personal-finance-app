import { defineConfig, devices } from "@playwright/test";

// Browser suite for the specs that need a signed-in owner.
//
// A production build, like every other browser config here. `next dev` is not an option:
// the strict CSP forbids the `eval()` React needs in development mode, so the app never
// hydrates and no click does anything (GOTCHAS, "Strict production CSP can block the
// Next.js development runtime"). The CSP is not relaxed to suit a test.
//
// What makes the development sign-in reachable in this build is `env` below, not the
// build mode. `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` is inlined at build time — hence
// setting it for `pnpm build` as well as for `next start` — so a build without it has
// neither the button nor a route that answers.
//
// Its own port, and `reuseExistingServer: false`, for the reason D-027 records: a server
// someone left running is silently reused and the suite then tests a stale build.
//
// Requires the local Supabase stack (`pnpm supabase:start`) and a configured `.env.local`,
// which `next start` loads itself. The specs skip with a plain explanation when either is
// missing, because a green run that silently proved nothing is worse than a skip.
const PORT = 3200;

export default defineConfig({
  testDir: "./tests/e2e",
  // Both owner-signed-in specs. `owner-access.spec.ts` covers the real sign-in surface —
  // TOTP enrolment and the code challenge — which needs the same build flag for the same
  // reason: it reaches those states through the development route's `?stop=aal1`.
  // **A prefix rather than a list of names, so the next owner spec is collected by existing.**
  // `owner-phone-audit.spec.ts` (PLAN task 51) was added on 2026-08-29 and the enumerated pattern
  // would have left it silently uncollected — which is the exact failure that file exists to
  // record: an instrument nobody runs is not an instrument. The three sibling configs all key off
  // the same `owner-` prefix, so a new spec lands in this suite and out of the other two together.
  testMatch: /owner-.*\.spec\.ts/u,
  fullyParallel: false,
  // **`fullyParallel: false` is not the same as serial, and the difference was invisible
  // while this config had one spec file.** It serialises tests *within* a file; separate
  // files still go to separate workers, and the default worker count is half the machine's
  // cores. Adding `owner-access.spec.ts` made two files run at once against one seeded
  // owner — both signing in as them, one enrolling MFA factors and the other deleting them.
  // The symptom named neither cause: `Auth session missing!` from a browser client whose
  // refresh token another worker's sign-in had rotated out from under it, on a test that
  // passed every time it was run alone (GOTCHAS).
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The Supabase target is pinned, not inherited. `next start` loads `.env.local`, and
    // once that file points at the live ledger (D-048) an unpinned browser suite would
    // run its wipes against real financial records. These values are the local CLI's
    // fixed defaults for the test project, so pinning them costs nothing and removes the
    // one path by which a configuration change could aim the suite at real data.
    env: {
      NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
      OWNER_GOOGLE_EMAIL: "synthetic.owner@example.invalid",
      // **Pinned empty so no browser run can call a third party, and this was found the hard
      // way** (D-129). The key lives in the owner's Windows *user* environment, so `next start`
      // inherits it on this machine — and the first run of the slip reader spec therefore made a
      // real Cloud Vision call with the generated QR fixture. Nothing about a browser suite should
      // depend on whose machine it is running on, and nothing about it should cost money or leave
      // the network. Empty makes the reader route answer 503 with the sentence written for a
      // deployment missing its key, which is deterministic everywhere and is what the spec asserts.
      GOOGLE_VISION_KEY: "",
      // **The same argument as the Vision key, one service along**, and this config is where it
      // became reachable: `owner-phone-audit.spec.ts` walks `/import`, which renders
      // `.sync-controls`. `.env.local` carries the owner's real statement mailbox — a dedicated
      // Gmail with 2FA and an IMAP app password — and `next start` inherits all three variables
      // from it, so a spec that ever clicks Sync would open IMAP against real mail from a suite
      // whose entire fixture set is invented.
      //
      // `lib/server/statement-mailbox-session.ts` treats an empty password as **missing** rather
      // than as a blank credential, so this fails the session closed instead of attempting an
      // anonymous connection. All three, not just the password: a half-pinned mailbox is a
      // configuration that exists in no other context and is not worth reasoning about.
      STATEMENT_MAILBOX_USER: "",
      STATEMENT_MAILBOX_APP_PASSWORD: "",
      STATEMENT_MAILBOX_SENDERS: ""
    }
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }]
});

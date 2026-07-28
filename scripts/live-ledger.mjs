#!/usr/bin/env node
// The live ledger: the Supabase project that holds real financial records, kept apart
// from the disposable test project so that `pnpm test` cannot reach it (D-048).
//
// Usage (project-local Node 24 — see docs/LOCAL_DEV.md):
//   node scripts/live-ledger.mjs up      start, migrate, bind the owner
//   node scripts/live-ledger.mjs status  report what is there
//   node scripts/live-ledger.mjs down    stop it, PRESERVING its data
//
// `down` here does not pass `--no-backup`, unlike the recovery destination: this volume
// holds real records and no script deletes it. Removing it is a deliberate act with a
// backup in hand.
//
// Point the app at it by setting NEXT_PUBLIC_SUPABASE_URL to its API URL in `.env.local`.
// The browser suites pin the test project explicitly, so a `.env.local` aimed here cannot
// drag them onto real data (playwright.owner.config.ts).
import { createProject, runCli } from "./lib/local-supabase.mjs";

const live = createProject({
  label: "The live ledger",
  workdir: "live",
  container: "supabase_db_private-ledger-live",
  apiUrl: "http://127.0.0.1:54341",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54342/postgres?sslmode=disable",
  seedFile: "live-seed.sql",
  ownerId: "44444444-4444-4444-8444-444444444444",
  disposable: false
});

runCli(live, process.argv);

#!/usr/bin/env node
// The recovery-rehearsal destination: an empty Supabase project, bound to a different
// owner than the primary one, with every committed migration applied. Disposable by
// design — `down` discards its data, because a rehearsal that reuses a dirty destination
// proves less than it appears to (D-044).
//
// Usage (project-local Node 24 — see docs/LOCAL_DEV.md):
//   node scripts/recovery-destination.mjs up      start, migrate, bind the owner
//   node scripts/recovery-destination.mjs status  report what is actually there
//   node scripts/recovery-destination.mjs down    stop it and discard its data
import { createProject, runCli } from "./lib/local-supabase.mjs";

const destination = createProject({
  label: "The recovery destination",
  workdir: "recovery",
  container: "supabase_db_private-ledger-recovery",
  apiUrl: "http://127.0.0.1:54331",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54332/postgres?sslmode=disable",
  seedFile: "destination-seed.sql",
  ownerId: "22222222-2222-4222-8222-222222222222",
  disposable: true
});

runCli(destination, process.argv);

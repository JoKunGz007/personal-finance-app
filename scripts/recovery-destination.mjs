#!/usr/bin/env node
// Brings up the recovery-rehearsal destination: an empty Supabase project, bound to a
// different owner than the primary one, with every committed migration applied.
//
// Usage (project-local Node 24 — see docs/LOCAL_DEV.md):
//   node scripts/recovery-destination.mjs up      start, migrate, bind the owner
//   node scripts/recovery-destination.mjs status  report what is actually there
//   node scripts/recovery-destination.mjs down    stop it and discard its data
//
// `supabase/migrations` stays the single source of truth: this applies those files, in
// filename order, to the destination, and records each one in
// `supabase_migrations.schema_migrations` exactly as `supabase db push` would — so the
// destination is a migrated project and not a hand-built schema that merely resembles one.
// `recovery/supabase/migrations` is deliberately empty.
//
// `db push` itself cannot be used here: given `--db-url` it treats the target as remote
// and insists on TLS, which a local container does not serve, and it ignores
// `sslmode=disable` in the URL. Its `--local` flag would push the *workdir's* migrations
// to the *workdir's* database, which for this workdir is nothing at all.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKDIR = join(ROOT, "recovery");
const CONTAINER = "supabase_db_private-ledger-recovery";
// `db push` speaks to this as if it were a remote project, so it insists on TLS unless
// told otherwise; a local container serves plain TCP.
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54332/postgres?sslmode=disable";
const OWNER = "22222222-2222-4222-8222-222222222222";

function run(file, args, options = {}) {
  return execFileSync(file, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
}

function supabase(args) {
  // The CLI ships as a dependency of this project; invoke it through the local binary
  // so the rehearsal cannot silently use a different globally installed version.
  // shell:true because on Windows `pnpm` is a .cmd shim, which Node 24 refuses to spawn
  // directly. Every argument here is a literal from this file.
  return run("pnpm", ["exec", "supabase", ...args, "--workdir", WORKDIR], { cwd: ROOT, shell: true });
}

function psql(sql) {
  try {
    return {
      ok: true,
      output: run("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql })
    };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function reachable() {
  return psql("select 1;").ok;
}

// A destination that already holds ledger rows is not a recovery destination. Say so
// before touching it rather than letting `restore_backup` refuse halfway through.
function ledgerRowCount() {
  const result = psql("select count(*) from public.accounts;");
  return result.ok ? Number(result.output.trim()) : null;
}

// Every migration file opens and closes its own transaction, so they are fed to psql
// verbatim; wrapping them in another one only produces "there is already a transaction
// in progress". The history row is therefore recorded as a separate statement after the
// file has committed.
//
// The history table is created here rather than assumed: the CLI creates it during
// `db reset`/`db push`, and this destination started with an empty migrations directory,
// so it has never had one.
function migrate() {
  const dir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();

  const ready = psql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    );
  `);
  if (!ready.ok) throw new Error(`could not prepare the migration history: ${ready.output}`);

  const applied = psql("select version from supabase_migrations.schema_migrations;");
  const known = new Set(applied.output.split("\n").map((line) => line.trim()).filter(Boolean));

  let count = 0;
  for (const file of files) {
    const version = file.split("_")[0];
    if (known.has(version)) continue;
    const name = file.slice(version.length + 1).replace(/\.sql$/u, "");
    const result = psql(readFileSync(join(dir, file), "utf8"));
    if (!result.ok) throw new Error(`migration ${file} failed: ${result.output}`);
    const recorded = psql(`insert into supabase_migrations.schema_migrations(version, name) values ('${version}', '${name}');`);
    if (!recorded.ok) throw new Error(`migration ${file} applied but was not recorded: ${recorded.output}`);
    process.stdout.write(`  applied ${file}\n`);
    count += 1;
  }
  process.stdout.write(`Migrations: ${files.length} committed, ${count} applied now.\n`);
}

function up() {
  if (!reachable()) {
    process.stdout.write("Starting the recovery destination (this pulls nothing new; the images are shared)…\n");
    process.stdout.write(supabase(["start"]));
  } else {
    process.stdout.write("Destination already running.\n");
  }

  migrate();

  const bound = psql(`select count(*) from public.ledger_owners where owner_id = '${OWNER}';`);
  if (bound.ok && Number(bound.output.trim()) === 1) {
    process.stdout.write("Owner already bound.\n");
  } else {
    process.stdout.write("Binding the destination owner…\n");
    const seeded = psql(readFileSync(join(WORKDIR, "destination-seed.sql"), "utf8"));
    if (!seeded.ok) throw new Error(`destination seed failed: ${seeded.output}`);
  }
  status();
}

function status() {
  if (!reachable()) {
    process.stdout.write("Destination is not running. `node scripts/recovery-destination.mjs up` starts it.\n");
    return;
  }
  const owner = psql("select owner_id, google_email from public.ledger_owners;");
  const rows = ledgerRowCount();
  process.stdout.write(`API   http://127.0.0.1:54331\nDB    ${DB_URL}\nOwner ${owner.ok ? owner.output.trim() || "(none bound)" : "(schema not applied)"}\nLedger accounts: ${rows ?? "(unavailable)"}\n`);
  if (rows) process.stdout.write("This destination is NOT empty — a restore into it will be refused.\n");
}

function down() {
  // --no-backup discards the volume: the destination is meant to be disposable, and a
  // rehearsal that reuses a dirty one proves less than it appears to.
  process.stdout.write(supabase(["stop", "--no-backup"]));
  process.stdout.write("Destination stopped and its data discarded.\n");
}

const action = process.argv[2] ?? "up";
const actions = { up, status, down };
if (!(action in actions)) {
  process.stderr.write(`Unknown action ${action}. Expected up, status, or down.\n`);
  process.exit(2);
}
try {
  actions[action]();
} catch (error) {
  process.stderr.write(`${error.stdout ?? ""}${error.stderr ?? ""}${error.message}\n`);
  process.exit(1);
}

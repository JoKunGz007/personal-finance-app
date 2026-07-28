// Shared machinery for the Supabase projects that live beside the primary one.
//
// There are two, and they exist for opposite reasons. `recovery/` is a disposable
// destination for proving a backup restores into a project that never held it. `live/`
// holds the owner's real ledger, kept apart from `private-ledger-local` so that
// `pnpm test` — which deletes every row the owner has — cannot reach it (D-047, D-048).
//
// `supabase/migrations` stays the single source of truth for both: this applies those
// files in filename order and records each in `supabase_migrations.schema_migrations`
// exactly as `supabase db push` would, so a side project is a migrated project rather
// than a hand-built schema that resembles one.
//
// `db push` itself cannot be used: given `--db-url` it treats the target as remote and
// insists on TLS, which a local container does not serve, and it ignores `sslmode=disable`
// in the URL. Its `--local` flag would push the *workdir's* migrations to the *workdir's*
// database, which for these workdirs is nothing at all.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function run(file, args, options = {}) {
  return execFileSync(file, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
}

export function createProject({ label, workdir, container, apiUrl, dbUrl, seedFile, ownerId, disposable }) {
  const WORKDIR = join(ROOT, workdir);

  function supabase(args) {
    // The CLI ships as a dependency of this project; invoke it through the local binary
    // so a side project cannot silently use a different globally installed version.
    // shell:true because on Windows `pnpm` is a .cmd shim, which Node 24 refuses to spawn
    // directly. Every argument here is a literal from this file.
    return run("pnpm", ["exec", "supabase", ...args, "--workdir", WORKDIR], { cwd: ROOT, shell: true });
  }

  function psql(sql) {
    try {
      return {
        ok: true,
        output: run("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql })
      };
    } catch (error) {
      return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  }

  const reachable = () => psql("select 1;").ok;

  function ledgerRowCount() {
    const result = psql("select count(*) from public.accounts;");
    return result.ok ? Number(result.output.trim()) : null;
  }

  // Every migration file opens and closes its own transaction, so they are fed to psql
  // verbatim; wrapping them in another one only produces "there is already a transaction
  // in progress". The history row is recorded separately, after the file has committed.
  //
  // The history table is created rather than assumed: the CLI creates it during
  // `db reset`/`db push`, and these projects start with an empty migrations directory.
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
      process.stdout.write(`Starting ${label} (nothing new is pulled; the images are shared)…\n`);
      process.stdout.write(supabase(["start"]));
    } else {
      process.stdout.write(`${label} already running.\n`);
    }

    migrate();

    const bound = psql(`select count(*) from public.ledger_owners where owner_id = '${ownerId}';`);
    if (bound.ok && Number(bound.output.trim()) === 1) {
      process.stdout.write("Owner already bound.\n");
    } else {
      process.stdout.write("Binding the owner…\n");
      const seeded = psql(readFileSync(join(WORKDIR, seedFile), "utf8"));
      if (!seeded.ok) throw new Error(`seed failed: ${seeded.output}`);
    }
    status();
  }

  function status() {
    if (!reachable()) {
      process.stdout.write(`${label} is not running.\n`);
      return;
    }
    const owner = psql("select owner_id, google_email from public.ledger_owners;");
    const rows = ledgerRowCount();
    process.stdout.write(
      `API   ${apiUrl}\nDB    ${dbUrl}\n` +
      `Owner ${owner.ok ? owner.output.trim() || "(none bound)" : "(schema not applied)"}\n` +
      `Ledger accounts: ${rows ?? "(unavailable)"}\n`
    );
    if (disposable && rows) process.stdout.write("This project is NOT empty — a restore into it will be refused.\n");
  }

  function down() {
    if (disposable) {
      // The recovery destination is meant to be thrown away, and a rehearsal that reuses
      // a dirty one proves less than it appears to.
      process.stdout.write(supabase(["stop", "--no-backup"]));
      process.stdout.write(`${label} stopped and its data discarded.\n`);
      return;
    }
    // A ledger holding real records is never discarded by a script. Stopping preserves
    // the volume; only the owner deletes it, deliberately, with a backup in hand.
    process.stdout.write(supabase(["stop"]));
    process.stdout.write(`${label} stopped. Its data is preserved in the Docker volume; \`up\` brings it back.\n`);
  }

  return { up, status, down, psql, reachable };
}

export function runCli(project, argv) {
  const action = argv[2] ?? "up";
  const actions = { up: project.up, status: project.status, down: project.down };
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
}

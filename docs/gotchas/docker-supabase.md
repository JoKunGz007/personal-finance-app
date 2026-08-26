# Private Ledger gotchas — Docker and the local Supabase projects

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **15 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


## Custom Docker binding networks break Supabase DNS

- Symptom: the database remains healthy while auth, storage, and realtime restart because they cannot resolve `supabase_db_private-ledger-local`.
- Cause: the attempted custom Docker network with a localhost bridge binding did not preserve Supabase service discovery after reset.
- Avoid: start Supabase without `--network-id`; use its default project network.
- Verify: 2026-08-10. `docker ps --filter "name=supabase_"` shows the expected services healthy and not restart-looping, and `supabase/config.toml` carries no network or docker keys — so D-009's default-network decision still holds and nothing has drifted back. Still live guidance rather than settled history: the trap fires the moment anyone passes `--network-id`, which nothing prevents.

## Local Supabase is development-only

- Symptom: Supabase warns that services bind to `0.0.0.0` and use shared default credentials.
- Cause: this is the CLI’s local development topology.
- Avoid: use it only on a trusted machine/network with the firewall enabled. Never reuse local keys or defaults in production.
- Verify: application URLs use `127.0.0.1`; do not paste `supabase status` output into docs or chat because it contains secrets. Dated 2026-07-24 from `9203a87`, the foundation commit that added `supabase/config.toml` and the local stack.

## Unrelated PostgreSQL containers already exist

- Symptom: `docker ps` shows older `pg_container` and `pgadmin4_container` resources and volumes.
- Cause: they predate this project.
- Avoid: filter Docker operations to names labeled for `private-ledger-local`. Never prune or delete unrelated containers, networks, or volumes.
- Verify: 2026-08-10. Three foreign containers are present right now — `database-postgres`, `pg_container` (postgres:12) and `pgadmin4_container` — so this is live, not historical. A broad `docker prune` or an unfiltered stop would take all three.

## A D-drive database is not an independent backup

- Symptom: the ledger and its “backup” can be lost in the same device failure, malware incident, or accidental deletion.
- Cause: two copies on one physical computer share a failure domain.
- Avoid: keep an encrypted restorable file on D only as one extra copy, with another encrypted copy off-machine and the password stored separately.
- Verify: 2026-08-10. Still live, and sharper than when written: the Windows service `postgresql-x64-18` is running on this machine, all three Supabase projects are local, and the newest backup sits on the same disk as the ledger it protects. Under D-083 hosting migrates by **restoring this file**, so it is now the whole migration rather than one copy among several — an off-machine copy matters more than it did, not less. The restore half of this line was discharged end to end on 2026-08-09 (D-078).

## Killing `docker exec` does not stop the process inside the container

- Symptom: a lock, transaction, or temp resource created by a spawned `docker exec` survives `child.kill()` and leaks into later tests.
- Cause: `kill` terminates the local client, not the process the daemon started in the container.
- Avoid: end the work from inside the database instead — for a Postgres session, tag it (`PGAPPNAME`) and `pg_terminate_backend` it by `application_name`.
- Verify: the advisory lock release test terminates the holder through SQL and then observes the lock become available. Dated 2026-07-25 from `f625ea5`, the advisory-lock work that spawns and tears down `psql` inside the container.

## `supabase db push --db-url` cannot reach a local container

- Symptom: `failed to connect to postgres: tls error (server refused TLS connection)` against a database that psql connects to happily, and adding `?sslmode=disable` changes nothing.
- Cause: given `--db-url` the CLI treats the target as a remote project and requires TLS, ignoring the URL's sslmode. Its `--local` flag is not an alternative: it pushes the *workdir's* migrations to the *workdir's* database, which for a second project whose migrations directory is deliberately empty is nothing at all.
- Avoid: apply the migration files to a second local project directly, in filename order, and record each in `supabase_migrations.schema_migrations` — which the CLI creates during `db reset`/`db push`, so a stack started with no migrations does not have it. Each file opens its own transaction, so feed them verbatim rather than wrapping them, or psql warns `there is already a transaction in progress` and the history insert lands outside the file's commit.
- Verify: `node scripts/recovery-destination.mjs up` reports nine migrations applied, and `status` shows the owner bound and an empty ledger. Dated 2026-07-24 from `9203a87`, which added the `supabase:reset` script that exists because this does not work.

## A stopped Docker makes the browser gate print all 18 test names and exit 0 without running one

- Symptom: `playwright test --config=playwright.owner.config.ts` lists every spec by name, `[1/18]` through `[18/18]`, finishes in seconds, and exits **0**. The only difference from a passing run is the last line: `18 skipped` rather than `18 passed`.
- Cause: `owner-session.spec.ts` calls `containerReachable()` at module scope and `test.skip()`s the whole file when the local Supabase container does not answer — correct behaviour, so the spec is harmless under a config that should not pick it up. When Docker Desktop has stopped, *nothing* answers, so the entire suite skips. The line reporter still enumerates the collected tests, which is what makes the output read like a full run.
- Note why this is worse than the Vitest version of the same trap: an exit code of 0 and eighteen green-looking lines defeat both of the usual checks. Reading "the counts, not the colour" only helps if the count read is `passed` and not the numeral beside it.
- Avoid: read the final word, not the tally. Before trusting any browser-gate result, confirm the daemon answers — `docker ps` failing with `failed to connect to the docker API at npipe:…` is the tell. After starting it, wait for the `supabase_db_…` containers to leave `health: starting`, and expect `auth` to lag the database by a few seconds.
- **Why it is not running is not what this file assumed, corrected by the owner 2026-08-10.** Earlier entries described Docker Desktop as having "stopped mid-session", five times in a week, which reads as an unstable daemon and points at the wrong remedy. It does not stop on its own: **it does not start with Windows, and a session that begins after a reboot begins without it.** So the risk is concentrated at the start of a session and after any restart of the machine, not scattered randomly through one — and the fix is to check `docker ps` first, or to turn on Docker Desktop's start-on-login, rather than to watch for crashes.
- Verify: 2026-08-05. The owner suite reported `18 skipped` at exit 0 while `docker ps` could not reach the daemon; after starting Docker Desktop and waiting for health, the identical command reported `18 passed (1.7m)`. Cause re-confirmed with the owner 2026-08-10; on that day the daemon ran fifteen hours unattended without stopping.

## Restarting the Supabase database container breaks every host connection until its dependants restart too

- Symptom: `supabase test db`, `supabase migration list --local` and every other CLI command that talks to the database fail with `LegacyDbConnectError: failed to connect to postgres`, while `docker exec supabase_db_… psql -U postgres` works, the container reports `(healthy)`, and `Test-NetConnection 127.0.0.1 -Port 54322` returns `True`. Later, a browser suite fails at sign-in with `Sign-in failed: fetch failed` and a Vitest recovery test dies with `UND_ERR_SOCKET: other side closed` against the recovery project's API port.
- Cause: two distinct effects with one trigger. `supabase db reset` restarts the project's containers, and Docker Desktop's port proxy can be left stale so host TCP connects but no backend conversation completes — the open port is the proxy, not Postgres. Separately, restarting the database container alone leaves `kong`, `auth`, `rest` and friends holding dead connections; they stay `healthy` because their health checks do not exercise the database. The API is then up and unable to serve, which reads as a network failure from every client.
- Avoid: after restarting the database container, restart the project's service containers too — `auth`, `rest`, `realtime`, `storage`, `pg_meta`, `kong` — not just the database. The recovery project is a *separate* project with its own set, so a recovery-portability failure needs its containers restarted independently of the test project's.
- Note the trap inside the trap: the in-container `psql` check that "proves the database is fine" is the one path that does not use the host proxy or a pooled service connection, so it succeeds in exactly the situation being diagnosed. It rules out data loss, not connectivity.
- Verify: 2026-07-30. Restarting `supabase_db_private-ledger-local` alone left `pnpm supabase:test` failing; restarting the six service containers restored it to 129/129. The identical failure appeared later on port 54331 and was fixed the same way against `private-ledger-recovery`.

## `supabase start` reports "already running" while its database container has exited

- Symptom: `supabase start` prints that the project is already running and exits successfully; the next command fails with `supabase_db_<project> container is not running: exited`. Nothing about the first message suggests anything is wrong, so the natural next step is to re-run it with `--debug` and read a longer version of the same wrong answer.
- Cause: the CLI decides "already running" from the presence of the project's containers rather than from their state, so an exited database satisfies it. The two halves of the check disagree, and only the second one talks to Postgres.
- Avoid: `supabase stop` then `supabase start`. Not `--debug`, and not `docker start` on the database alone — that leaves the service containers holding dead connections, which is the trap directly above this one.
- Verify: 2026-08-12. Hit on **both** the main project and the recovery destination in the same session, which is what makes it a trap rather than a one-off; `docker ps -a --filter name=supabase_db_` shows the exited container while `supabase start` still claims the project is up. CLI v2.109.1.

## Windows reserves the whole local Supabase port block, and every container still reports healthy

- Symptom: three different failures that look unrelated. Containers come back from a Docker Desktop restart as `Up (healthy)` but nothing answers on `127.0.0.1:54321`, so every database-backed suite fails with `ECONNREFUSED` instead of skipping. `docker restart` on the service containers changes nothing. Then `supabase start` finally names it: `ports are not available: exposing port TCP 0.0.0.0:54322 -> 127.0.0.1:0: bind: An attempt was made to access a socket in a way forbidden by its access permissions`.
- Cause: WinNAT/Hyper-V takes **dynamic** TCP port reservations at boot, and one of them can swallow the project's whole block. Measured here as `54243-54342`, which covers `private-ledger-local` entirely (54321 gateway, 54322 db, 54323 studio, 54324 inbucket) and reaches into `private-ledger-recovery`'s 5433x. Docker starts the containers anyway and simply does not publish the ports: `docker inspect` shows `HostConfig.PortBindings` carrying `8000/tcp -> 54321` while `NetworkSettings.Ports` is `{"8000/tcp":[]}`. **That gap is the whole diagnosis** — a configured binding that was never established — and no `docker ps` column shows it.
- Avoid: read the reservation before touching Docker — `netsh interface ipv4 show excludedportrange protocol=tcp` and look for a range covering 54321. Clearing it needs an **elevated** shell (`net stop winnat` then `net start winnat`, then `supabase stop` and `supabase start`), so an agent cannot fix this and must hand it back. Reserving the block permanently is what stops it recurring: `netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=30 store=persistent`, also elevated. **Do not read a `docker restart` as the remedy** — the trap directly above this one has the same symptom and a different cause, and trying that one first is what costs the time here.
- Verify: 2026-08-23. `netsh` reported `54243-54342` while all ten `private-ledger-local` containers read `Up (healthy)`, `curl http://127.0.0.1:54321/rest/v1/` returned `000`, and Kong's own log showed a clean start with its workers up — the container was fine and the host binding never existed. `supabase stop` had already backed the data up to `docker volume ls --filter label=com.supabase.cli.project=private-ledger-local`, which survived the failed start, so the cost was the stack being down rather than anything lost.

## A source-grep guard pinned to one spelling passes when the code is rewritten

- Symptom: a test whose entire purpose is to forbid a change passes after that change is made. `tests/privacy.test.ts` carried "never infers which ledger account a statement belongs to" and went green the day auto-binding was added.
- Cause: it asserted `not.toMatch(/find\([^)]*accountLastFour/)` — a *spelling*. The new code used `.filter(...)`, so the pattern did not match and the guard reported success. Every guard in that file reads source text rather than running behaviour, so all of them are exposed to this; the ones matching a **whole call site** are far more fragile than the ones matching a name.
- Avoid: assert the property, not the phrasing. Slice the function by name and check what it must contain (`matches.length === 1`, both halves of the identity) alongside what it must not (`fuzzy|score|closest`), and make every assertion fail loudly when its marker is missing — `expect(section, "X must exist for this test to mean anything")` — so a rename cannot make it pass vacuously. Where behaviour can be exercised instead of grepped, exercise it: the browser check for the same rule asserts `import_batches` stays at zero, which no rewrite can fake.
- Verify: 2026-08-23 (D-144). Reproduced by adding auto-binding and watching the guard pass; the rewritten guard fails against the pre-D-144 spelling and passes after, and the browser test in `.runtime/worklist-phone-audit.spec.ts` proves the unrelaxed half independently of any grep.

## A guard narrows in meaning without failing, because the behaviour moved to a file it does not name

- Symptom: a guard that reads "this file sends nothing anywhere" is still green, the file it names is still clean, and the promise it was written to protect is now only half true. Nothing failed, nothing was rewritten, and no review would catch it from the diff of either file.
- Cause: the *system* changed around a guard scoped to a file list. `tests/privacy.test.ts` asserted that `app/statement-batch.tsx` and `lib/statement-batch.ts` construct no request of any kind, standing for "statement import reads entirely on the device". The hosted Sync button then added `app/statement-sync.tsx`, which fetches — correctly, and by design, since it moves only ciphertext — and the old assertion went on passing while no longer being the whole claim.
- This is the **quiet** sibling of the spelling trap above and it is worse in one way: there, a rewrite made a green check wrong. Here nothing is wrong yet, and the check's *scope* has silently stopped matching its *sentence*. The same shape has already bitten this repo when a page split into routes and a source-grep test kept passing over files the code had left.
- Avoid: when a behaviour leaves a guarded file, do not let the guard's silence be the record. Say in the guard's own comment what it still means and what it no longer means on its own, and add the sibling guard in the same commit. Prefer a guard scoped to a *found* file set over a named one where that is possible — the walk in "installs no observation tooling" is the pattern. And be suspicious of a privacy guard that has never failed: ask what would have to move for it to stay green and stop mattering.
- Verify: 2026-08-23 (D-145). Both halves run in `tests/privacy.test.ts`: the batch still fetches nothing, and the sync surface's two GETs are asserted to be same-origin, body-free and built from a named path constant.

## A word-grep in a privacy guard fails on the sentence that documents the rule

- Symptom: a guard forbidding `password` anywhere in a component fails against a component that has no password — because the component *tells the owner* to "type the document password" into the form below, which is the correct instruction. The same guard against a route fails on "check that the app password is current", the message the owner needs when a mailbox credential expires.
- Cause: the word is not the secret. A grep for a noun matches prose, help text and the comment explaining the very rule being enforced, and the repo already carries "a source-grep test matches the comment that explains its own rule" for the comment half of this.
- Avoid: assert the **shapes that would carry a secret** — a prop in the destructured parameter list, a piece of state, a `type="password"` field, a request body, a named environment variable — not the word. Where a comment or a user-facing string must be excluded, strip comments explicitly (`source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*/gu, "")`) rather than loosening the pattern, and never strip user-facing strings: if a string genuinely must not contain the word, that is a real assertion and should stay.
- Verify: 2026-08-23 (D-145). Both failures were reproduced against `app/statement-sync.tsx` and the two mailbox routes before the assertions were narrowed to shapes.

## Stripping comments before a source grep also strips the `//` inside a URL literal

- Symptom: a guard forbidding absolute URLs in a client file passes against a file containing `fetch("https://mail.google.com/…")`. Every other assertion in the same test is sound, and the one written to catch the exact drift that matters is the one that cannot.
- Cause: the source was pre-processed with `source.replace(/\/\/.*/gu, "")` to keep prose out of the greps — a reasonable step, added for a real reason. But a line-comment stripper knows nothing about string literals, so `"https://…"` becomes `"https:` and the `/https?:\/\//` pattern finds nothing. **The transform removed exactly the two characters the pattern was looking for.**
- Avoid: run each assertion against the representation it needs, not one shared scrubbed copy. Comment-stripping is right for greps over identifiers and wrong for any pattern containing `//`, `/*` or a quote — those go against the raw source. When both are needed in one test, name the two variables so the choice is visible at each call site rather than inherited from the top of the block.
- Verify: 2026-08-24 (D-145). Found by `/code-review` against a guard written the same day; reproduced by pasting a third-party `fetch` into `app/statement-sync.tsx` and watching the stripped-source assertion pass and the raw-source one fail.

## Playwright's route glob treats `?` as a wildcard, so a path glob also matches its own sub-paths

- Symptom: an intercept registered for one endpoint silently swallows a different endpoint one path segment deeper, and the test either serves the wrong body or hangs waiting for a request that was already answered.
- Cause: `page.route()` globs are not URL patterns. `*`, `**` and `?` are all wildcards, and `?` matches exactly one character — so `**/api/v1/imports/mailbox?**`, written to mean "that path with any query", also matches `/api/v1/imports/mailbox/attachment?...`, with `?` consuming the `/`. Registration order does not save you either: Playwright matches the **most recently registered** route first, so which one wins depends on the order the handlers happen to be written in.
- Avoid: use a URL predicate rather than a glob whenever two endpoints share a prefix — `page.route((url) => url.pathname === "/api/v1/imports/mailbox", handler)`. It states the intent exactly, cannot be shadowed by a sibling, and reads the query through `URLSearchParams` where the query actually matters.
- Verify: 2026-08-23 (D-145). `.runtime/mailbox-sync.spec.ts` drives the list route and the attachment route separately and asserts each is called with the uid and part it should be.

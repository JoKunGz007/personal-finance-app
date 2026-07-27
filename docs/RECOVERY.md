# Local operation and recovery

## Clean local acceptance

Start Docker Desktop's Linux engine, use Node 24, enable Corepack, install dependencies, then run `pnpm supabase:start` and `pnpm supabase:reset`. A reset reapplies every committed migration and the invented local seed. Standalone PostgreSQL is not an acceptance environment.

Run unit/property tests, pgTAP, build, and Playwright. Inspect browser network, storage, Cache Storage, console, server logs, and failure paths. There must be no PDF bytes, password, auth token, or unredacted real value.

## Backup custody

The API exports schema-version 2 canonical owner data to the authenticated page with `no-store`. One database RPC takes the ledger-mutation lock and returns a count-checked snapshot, so PostgREST row limits cannot truncate a table. Every `bigint` is text at the API boundary. The page hashes that exact payload, gzips it, derives a non-extractable AES-256 key with PBKDF2-HMAC-SHA-256 at 600,000 iterations and a random 16-byte salt, then encrypts with AES-GCM and a random 12-byte nonce. Only after the encrypted artifact has been handed to the download flow does the page acknowledge its digest and snapshot sequence; the database marks it current only if the ledger sequence has not changed. Keep the backup file and its password separately.

The current synthetic interface downloads `.pldemo`, an encrypted non-restorable preview. It never clears authoritative backup staleness. Pre-release schema-version 1 artifacts are intentionally unsupported; schema version 2 is the first recovery contract allowed before real-data use.

Restore accepts only schema-version 2 requests. Stage binds an exact ordered 11-table manifest, counts, per-chunk SHA-256 values, snapshot sequence, and aggregate payload digest. Identical chunk retries are idempotent; missing, reordered, overwritten, or altered content is rejected. Commit recomputes all bindings, takes the owner mutation advisory lock, requires an empty destination ledger, remaps every owner/actor field to the newly bound owner, and applies all chunks transactionally. It restores the backed mutation sequence, increments it once, and marks the restored ledger backup-stale.

## Portable recovery rehearsal

A backup is only a backup if it restores into a project that never held it. That is rehearsed locally against a second Supabase project, `private-ledger-recovery` (`recovery/supabase/config.toml`), which runs alongside the primary one on ports 5433x and is bound to a different invented owner.

```powershell
node scripts/recovery-destination.mjs up      # start, migrate, bind the destination owner
pnpm exec vitest run tests/recovery-portability.test.ts
node scripts/recovery-destination.mjs down    # stop it and discard its data
```

`up` applies every file in `supabase/migrations` in filename order and records each in `supabase_migrations.schema_migrations`, so the destination is a migrated project rather than a hand-built schema. It cannot use `supabase db push`: given `--db-url` the CLI treats the target as remote and requires TLS, which a local container does not serve, and it ignores `sslmode=disable`.

The rehearsal exports over HTTP from the primary project under a real aal2 session, encrypts and decrypts the artifact, builds the request sequence with `lib/restore-plan.ts`, and stages, chunks and commits it into the destination under that project's own aal2 session. It then asserts that every table arrived intact, that the source owner survives nowhere — including inside the jsonb an overlay revision embeds — and that a second recovery into the now-populated destination is refused for being non-empty.

**Use `lib/restore-plan.ts` to build a restore outside the app.** It produces the exact stage/chunk/commit sequence `public.restore_backup` accepts. The manifest binds eleven chunk digests, an aggregate payload digest, the snapshot sequence and per-table counts, all recomputed server-side; reconstructing that by hand is not realistic.

What this rehearsal does not cover: it drives PostgREST directly rather than the Next.js route or the app, and nothing hosted has been tested at all.

## Recovery from the app

The app itself can now take a real backup and restore one — § Recovery / 04 on the page, available to a signed-in owner whether or not a statement is open.

**Export** fetches `GET /api/v1/backups/export`, encrypts the snapshot in the browser under a password the server never receives, writes a `.plbak` file, and only then acknowledges custody through `POST /api/v1/backups/export`. The database marks the backup current only if the ledger has not moved since the snapshot was taken, so a file that was written while an import landed leaves the ledger backup-stale and says so.

**Restore** takes the `.plbak` file and its password, decrypts in the browser, builds the request sequence with `lib/restore-plan.ts`, and sends stage, eleven chunks and commit to `POST /api/v1/backups/restores/[action]`. It requires an **empty ledger** and is refused otherwise, at commit, after every chunk has been accepted — that is what makes it a recovery into a fresh installation rather than an overwrite of a live one.

Keep the file and its password apart, and note what the pair means: either alone is useless, and losing both makes the ledger unrecoverable. The `.pldemo` preview offered beside a parsed synthetic statement is a different artifact entirely and is not restorable.

## Hosted recovery rehearsal

After local acceptance, bind the hosted owner with a temporary service-role credential, enroll and verify two distinct TOTP factors, then remove that credential. Repeat the portable restore above against a hosted destination before importing real data. Document recovery codes offline; losing both factors without a tested recovery path can make the ledger inaccessible.

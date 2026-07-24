# Local operation and recovery

## Clean local acceptance

Start Docker Desktop's Linux engine, use Node 24, enable Corepack, install dependencies, then run `pnpm supabase:start` and `pnpm supabase:reset`. A reset reapplies every committed migration and the invented local seed. Standalone PostgreSQL is not an acceptance environment.

Run unit/property tests, pgTAP, build, and Playwright. Inspect browser network, storage, Cache Storage, console, server logs, and failure paths. There must be no PDF bytes, password, auth token, or unredacted real value.

## Backup custody

The API exports schema-version 2 canonical owner data to the authenticated page with `no-store`. One database RPC takes the ledger-mutation lock and returns a count-checked snapshot, so PostgREST row limits cannot truncate a table. Every `bigint` is text at the API boundary. The page hashes that exact payload, gzips it, derives a non-extractable AES-256 key with PBKDF2-HMAC-SHA-256 at 600,000 iterations and a random 16-byte salt, then encrypts with AES-GCM and a random 12-byte nonce. Only after the encrypted artifact has been handed to the download flow does the page acknowledge its digest and snapshot sequence; the database marks it current only if the ledger sequence has not changed. Keep the backup file and its password separately.

The current synthetic interface downloads `.pldemo`, an encrypted non-restorable preview. It never clears authoritative backup staleness. Pre-release schema-version 1 artifacts are intentionally unsupported; schema version 2 is the first recovery contract allowed before real-data use.

Restore accepts only schema-version 2 requests. Stage binds an exact ordered 11-table manifest, counts, per-chunk SHA-256 values, snapshot sequence, and aggregate payload digest. Identical chunk retries are idempotent; missing, reordered, overwritten, or altered content is rejected. Commit recomputes all bindings, takes the owner mutation advisory lock, requires an empty destination ledger, remaps every owner/actor field to the newly bound owner, and applies all chunks transactionally. It restores the backed mutation sequence, increments it once, and marks the restored ledger backup-stale.

## Hosted recovery rehearsal

After local acceptance, bind the hosted owner with a temporary service-role credential, enroll and verify two distinct TOTP factors, then remove that credential. Test a portable restore into an empty separately bound project before importing real data. Document recovery codes offline; losing both factors without a tested recovery path can make the ledger inaccessible.

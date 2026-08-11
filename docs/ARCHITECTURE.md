# Architecture and decisions

## Trust boundaries

- The browser main thread selects the file and transfers its `ArrayBuffer` to a dedicated worker.
- PDF.js and the ephemeral document password exist only in that worker. They are never posted to an API, logged, cached, or stored.
- The worker fails closed on an unfamiliar signature or anchor set and emits structured facts only after the parser contract passes.
- Browser financial operations use `/api/v1`; PostgreSQL RLS still protects direct PostgREST requests.

## Money and time

PostgreSQL `bigint` and canonical signed integer strings are authoritative. Binary floating point, exponent notation, leading zeroes, negative zero, mixed currencies, and values outside signed int64 are rejected. All persisted currency is explicit `THB`.

Source date and optional time remain separate. Effective date is an overlay-capable reporting fact. `Asia/Bangkok` and the explicit `+07:00` offset are used only when an instant or reporting boundary is derived.

## Import identity

`fingerprint-v1` hashes the canonical account UUID, bank code, source date/time, NFKC/collapsed source text, reference, signed withdrawal/deposit totals, printed balance, and branch. The payload digest covers the complete canonical import. One advisory-locked RPC owns artifact/idempotency conflicts, overlap linking, inserts, audit, and mutation sequence changes.

## Data model

Source transactions, components, row provenance, artifacts, batches, overlay revisions, and audit events are append-only. Import batches also retain the immutable statement period, opening/closing balances, and currency. Confirmation recomputes sequential indexes, component signs/sums, date bounds, running balances, and final closing balance in PostgreSQL; only the recognized one-deposit/one-withdrawal compound row can resynchronize to its printed balance. Current overlays may change description, counterparty, effective date, category, note, and reporting inclusion only. Category changes use the same mutation lock, audit trail, and backup-staleness sequence as other ledger mutations.

Backup export is one advisory-locked database snapshot with explicit stable table ordering and canonical text for every `bigint`. Restore content is authenticated twice: the encrypted envelope protects the file, while the staged manifest binds the ordered table kinds, counts, chunk digests, aggregate digest, and snapshot sequence before atomic application.
Snapshot retrieval does not mark a backup current. A separate acknowledgement may do that only after client-side encryption and download handoff, and only while the mutation sequence still matches. The synthetic `.pldemo` path is explicitly non-restorable and never acknowledges backup freshness.

Strong access means the bound owner UUID, JWT `aal2`, and at least one verified TOTP factor (D-093, migration 015; it was two until 2026-08-11). Owner binding is service-role-only, advisory locked, Google-provider verified, and permanently single-owner.

## Caching and observation

There is intentionally no service worker in the financial slice. All routes and pages send `no-store`. No analytics, session replay, error-observation SDK, or third-party font request is installed.

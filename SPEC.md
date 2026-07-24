# Private Ledger specification index

Last reviewed: 2026-07-24

This file is the stable entry point for project requirements. It summarizes only the cross-cutting contract and links to the detailed specifications that own the exact behavior.

## Product objective

Private Ledger is a local-first, single-owner application that converts a supported Krungthai statement into a reconciled, reviewable ledger without exposing the PDF, its password, or private financial data.

The current development stage uses invented data only. Real statement testing, hosted Supabase, OAuth setup, Vercel, deployment, commits, and pushes require separate explicit authorization.

Detailed product and interface direction:

- [PRODUCT.md](PRODUCT.md)
- [DESIGN.md](DESIGN.md)
- [docs/PRODUCT_CHARTER.md](docs/PRODUCT_CHARTER.md)

## Authoritative invariants

- Money is signed 64-bit integer minor units with explicit `THB`. JSON boundaries use canonical decimal strings; binary floating point is never authoritative.
- Source facts, components, provenance, artifacts, batches, overlay history, and audit events are append-only.
- Import, restore, category mutation, retries, and other replayable operations are idempotent or conflict explicitly.
- Dates use the documented statement meaning. Derived instants and reporting boundaries use `Asia/Bangkok`.
- The PDF and password remain inside the dedicated browser worker. Unknown or unvalidated layouts fail closed.
- PostgreSQL is a second enforcement boundary for ownership, reconciliation, immutability, audit, and recovery.
- Strong access requires the bound owner, `aal2`, and two verified TOTP factors.
- Backup freshness means confirmed custody of an encrypted restorable artifact, not merely successful snapshot generation.

Detailed contracts:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/KRUNGTHAI_CONTRACT.md](docs/KRUNGTHAI_CONTRACT.md)
- [docs/FIXTURE_POLICY.md](docs/FIXTURE_POLICY.md)
- [docs/RECOVERY.md](docs/RECOVERY.md)

## Current local acceptance gate

Before any real-data or hosted stage:

1. A clean local Supabase reset must apply every migration and synthetic seed.
2. Lint, strict TypeScript, unit/property tests, pgTAP, production build, Playwright, privacy checks, and accessibility checks must pass on the current source.
3. Synthetic PDF geometry fixtures must validate the exact supported parser contract before parser support is enabled.
4. Backup export, client encryption, acknowledgement, staged restore, and equality must be exercised end to end with canonical int64 boundaries and more than 1,000 rows.
5. No PDF bytes, passwords, tokens, real values, analytics, service worker caches, or third-party font requests may cross their documented boundary.

The live checkpoint and remaining work are maintained in [PLAN.md](PLAN.md).

## Explicit non-goals for the current stage

- No production deployment or hosted resource creation.
- No real statement parsing or smoke test without renewed authorization.
- No multi-user sharing, currency conversion, investment tracking, budgeting, or bank credential storage.
- No statement password in environment variables, logs, database rows, or backup metadata.
- No claim that a synthetic `.pldemo` preview is a restorable backup.

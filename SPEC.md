# Private Ledger specification index

Last reviewed: 2026-07-27

This file is the stable entry point for project requirements. It summarizes only the cross-cutting contract and links to the detailed specifications that own the exact behavior.

## Product objective

Private Ledger is a local-first, single-owner application that converts a supported bank statement — Krungthai, SCB, or KBANK — into a reconciled, reviewable ledger without exposing the PDF, its password, or private financial data. Receipts are images and are a separate build (D-037).

Committed data remains invented only. Hosted Supabase, OAuth setup, Vercel, deployment, commits, and pushes require separate explicit authorization. Local real-statement smoke tests were authorized on 2026-07-25 under stated conditions and were run ten times by the owner, reading a statement end to end; every finding came from on-device masked diagnostics, so no real value entered the repository. Direct access to `private-statements/` was granted the same day under an **invoke, don't read** boundary, and `docs/FIXTURE_POLICY.md` is amended accordingly (D-035) — a masking harness may be run against a statement, and the statement itself may not be read. See `PLAN.md` § Later authorization gates and `HANDOFF.md` § Standing authorizations before acting on any of it.

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
- [docs/SCB_CONTRACT.md](docs/SCB_CONTRACT.md)
- [docs/KBANK_CONTRACT.md](docs/KBANK_CONTRACT.md)
- [docs/FIXTURE_POLICY.md](docs/FIXTURE_POLICY.md)
- [docs/RECOVERY.md](docs/RECOVERY.md)

## Current local acceptance gate

Before any real-data or hosted stage:

1. A clean local Supabase reset must apply every migration and synthetic seed.
2. Lint, strict TypeScript, unit/property tests, pgTAP, production build, Playwright, privacy checks, and accessibility checks must pass on the current source.
3. Synthetic PDF geometry fixtures must validate the exact supported parser contract before parser support is enabled.
4. Backup export, client encryption, acknowledgement, staged restore, and equality must be exercised end to end with canonical int64 boundaries and more than 1,000 rows.
5. No PDF bytes, passwords, tokens, real values, analytics, service worker caches, or third-party font requests may cross their documented boundary.
6. An encrypted backup must restore into an **empty, separately bound project** — one that never held the ledger and never knew its owner — with every owner and actor identity rebound, including identities embedded in jsonb.

Status as of 2026-07-27 for SCB and KBANK: gate 1 passes with migrations 001–009; gates 2 and 5 pass on the current source; gate 3 is met by the invented fixtures in `tests/fixtures/statement-layouts.ts`, which are also rendered into real PDFs and read through pdf.js in the browser suite — and is now **discharged for parsing** on both. On 2026-07-27 the owner read one real statement of each layout, each on the first attempt: 94 rows across 5 pages for SCB, and 55 rows across 2 pages for KBANK. The KBANK read is independently verified twice over — the masked dump of that document covers both its pages in full and contains exactly 55 transaction rows, and the bank's own printed counts and totals agreed with all of them.

What those reads did **not** establish: neither statement was imported. Binding, the authenticated import path, and reconciliation against real rows remain unexercised on real input. See `PLAN.md` task 11.

The app can create the account a statement needs, as of 2026-07-27 (D-045). Until then every account came from the seed and `public.accounts` had no write path at all, so a statement printing an unmatched suffix — which both real statements did — could be read and then bound to nothing. Account writes go through `public.mutate_account` alone; `authenticated` still holds no insert, update or delete on the table, and pgTAP asserts it.

Gate 6 passes locally as of 2026-07-27 (D-044): a ledger exported from the primary project restores into `private-ledger-recovery`, a second project bound to a different owner, with every identity rebound — including one embedded inside `overlay_revisions.snapshot` that no column-level check reaches. That discharges `PLAN.md` § Later authorization gates item 3 locally. The app can now take and restore a real backup itself (D-046, `PLAN.md` task 14): § Recovery / 04 exports an encrypted `.plbak` and restores one into an empty ledger, proven by a browser test that destroys the ledger between the two halves. None of this relaxes "committed data remains invented only" — importing a real statement remains the owner's explicit decision, and no hosted recovery has been rehearsed.

Status as of 2026-07-25 for Krungthai: gates 1, 2, 4, and 5 pass against synthetic data — re-verified after the account-binding UI and route-wrapper coverage landed (D-021, D-022) — and gate 3 is met for the transaction grid and statement frame by the invented fixtures in `tests/fixtures/krungthai-layout-v1.ts` (DECISIONS D-015, D-016). Gate 3 remains only partly discharged in substance: the fixture geometry was invented rather than measured, so it validates the parser contract without establishing that a real Krungthai layout matches it. The authorized smoke tests are the only check of that. Ten attempts on 2026-07-25 found eleven defects between them (D-023 … D-032), and gate 3 is now **discharged for parsing**: a real statement opens, decodes, matches its bank signature and all seven column headings, states its currency, yields its frame, and parses all 233 of its rows across 12 pages through to the account-binding stage. The date format is confirmed. Gate 3 is now discharged for verification too: the reader cross-checks every import against the statement's own printed counts and totals and fails closed on disagreement (D-033), and on the real statement those counts sum to exactly the rows read while the totals close the balance chain. Still unreached behind a real PDF: binding, the authenticated import path, and the charset rejection path — blocked on local Supabase configuration rather than on the parser. See `PLAN.md` tasks 7 and 10.

The live checkpoint and remaining work are maintained in [PLAN.md](PLAN.md).

## Explicit non-goals for the current stage

- No production deployment or hosted resource creation.
- No real statement parsing or smoke test beyond the single run authorized on 2026-07-25, and none without the owner present.
- No multi-user sharing, currency conversion, investment tracking, budgeting, or bank credential storage.
- No statement password in environment variables, logs, database rows, or backup metadata.
- No claim that a synthetic `.pldemo` preview is a restorable backup.

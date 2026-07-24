# Private Ledger decision log

Last reviewed: 2026-07-25

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

## D-001 — Local-first synthetic development

- Date: 2026-07-24
- Status: Accepted
- Decision: Complete local implementation and recovery acceptance with invented data before any real statement or hosted resource is used.
- Rationale: Financial data and statement passwords are high-risk; parser and recovery boundaries must be proven without private inputs.
- Evidence: `PRODUCT.md`, `docs/FIXTURE_POLICY.md`, `README.md`.

## D-002 — Canonical integer money

- Date: 2026-07-24
- Status: Accepted
- Decision: Persist authoritative money as PostgreSQL `bigint`; cross JSON boundaries only as canonical signed-int64 decimal strings with explicit currency.
- Rationale: JavaScript numbers cannot preserve all signed-int64 values and binary floating point is unsuitable for authoritative money.
- Evidence: `lib/money.ts`, `lib/backup-contract.ts`, `docs/ARCHITECTURE.md`.

## D-003 — Worker-contained PDF boundary

- Date: 2026-07-24
- Status: Accepted
- Decision: PDF bytes and the document password remain inside a dedicated browser worker. Unsupported geometry fails closed.
- Rationale: The server and main application do not need the original document or password.
- Evidence: `workers/krungthai.worker.ts`, `docs/KRUNGTHAI_CONTRACT.md`.

## D-004 — Strong single-owner access

- Date: 2026-07-24
- Status: Accepted
- Decision: Authoritative access requires a permanently bound owner, `aal2`, and two verified TOTP factors.
- Rationale: The ledger is deliberately single-owner and contains sensitive financial history.
- Evidence: `supabase/migrations/202607240002_security_and_rpcs.sql`, `docs/ARCHITECTURE.md`.

## D-005 — Schema-v2 recovery is the first supported backup contract

- Date: 2026-07-24
- Status: Accepted
- Decision: Restorable backups use schema version 2 with a locked snapshot, exact manifest, canonical strings, authenticated encryption, and acknowledgement only after client custody. Pre-release v1 is unsupported.
- Rationale: Recovery must detect truncation, reordering, mutation races, and tampering before atomic application.
- Evidence: `supabase/migrations/202607240004_backup_and_ledger_hardening.sql`, `lib/backup-contract.ts`, `docs/RECOVERY.md`.

## D-006 — Synthetic preview is not a backup

- Date: 2026-07-24
- Status: Accepted
- Decision: The UI’s `.pldemo` artifact is a non-restorable synthetic preview and never marks the ledger backup-current.
- Rationale: Labeling a partial synthetic payload as schema-v2 recovery would create false confidence.
- Evidence: `app/ledger-app.tsx`, `README.md`.

## D-007 — Compound-row resynchronization requires provenance

- Date: 2026-07-24
- Status: Accepted
- Decision: A one-deposit/one-withdrawal row may resynchronize only when parser provenance explicitly marks the recognized interest/tax ordering anomaly.
- Rationale: Component shape alone cannot distinguish a known bank-layout anomaly from an unexplained balance gap.
- Evidence: `lib/reconcile.ts`, migration 004, `docs/KRUNGTHAI_CONTRACT.md`.

## D-008 — Docker Supabase is the acceptance database

- Date: 2026-07-24
- Status: Accepted
- Decision: Use the project’s Docker-based local Supabase stack for migrations, RLS/RPC behavior, and pgTAP. A standalone Windows PostgreSQL installation is not interchangeable.
- Rationale: Supabase acceptance depends on its extensions, roles, services, and migration environment.
- Evidence: `README.md`, `docs/RECOVERY.md`.

## D-009 — Use Supabase’s default Docker network locally

- Date: 2026-07-24
- Status: Accepted
- Decision: Keep the project on Supabase’s default Docker network. Do not reuse the attempted custom localhost-binding network.
- Rationale: The custom network broke service discovery after `supabase db reset`, causing auth, storage, and realtime restart loops.
- Consequence: Default local services may bind development ports to all interfaces; use only on a trusted machine/network with firewall protection.
- Evidence: `GOTCHAS.md`.

## D-010 — Repository continuity files

- Date: 2026-07-24
- Status: Accepted
- Decision: Maintain `SPEC.md`, `PLAN.md`, `DECISIONS.md`, and `GOTCHAS.md`, enforced through `AGENTS.md` and reconciled with the project-local `$sync-continuity` skill.
- Rationale: Critical state should survive context compaction and new agent sessions without relying on chat history.
- Evidence: `AGENTS.md`, `.agents/skills/sync-continuity/SKILL.md`.

## D-011 — Claude subagent workflow is a lean, tiered adaptation of the Codex one

- Date: 2026-07-24
- Status: Accepted
- Decision: Provide a Claude Code subagent workflow in `.claude/agents/` that mirrors the Codex roles selectively rather than 1:1. Keep only two custom agents — `finance-implementer` (Sonnet) and `finance-reviewer` (Sonnet) — and rely on the built-in `Explore` agent for read-heavy discovery and the `/verify` and `/code-review` skills for validation/review. `CLAUDE.md` is the Claude entry point; `AGENTS.md` remains the tool-neutral routing/invariant authority.
- Rationale: The upstream Codex workflow (`CODEX_AGENT_WORKFLOW.md`, ref `github.com/nsEytgXm/subagents_configs`) optimizes *monetary cost* by delegating-by-default to cheap model tiers, accepting duplicated context because per-token dollar cost drops. On a Claude Pro subscription the scarce resource is the weekly usage limit, which meters cost-weighted tokens — so "delegate by default" burns the limit faster. The transferable value is bias-reduction (independent review/validation) and context hygiene, not cost arbitrage. Therefore: delegate *selectively*, and tier implementation/review subagents down to Sonnet, reserving the Opus parent for decomposition, architecture, migrations, hard debugging, and money/idempotency/migration judgment. Delegating a decision-complete, well-scoped implementation to a Sonnet subagent is the largest weekly-limit saver available, provided the scoping is genuinely complete; the implementer is instructed to return unresolved decisions rather than guess, and the reviewer/validator is the safety net for tiered-down work.
- Evidence: `CLAUDE.md`, `.claude/agents/finance-implementer.md`, `.claude/agents/finance-reviewer.md`, `AGENTS.md`, `CODEX_AGENT_WORKFLOW.md`.

## D-012 — Import payload digest is server-recomputed and bound, never trusted

- Date: 2026-07-24
- Status: Accepted
- Decision: `confirm_import` recomputes the canonical payload digest in PostgreSQL over the statement frame plus the exact rows it receives (`private.sha256_jsonb` over `private.canonical_jsonb`), rejects any mismatch with the caller-supplied digest (`payload digest mismatch`), and uses the recomputed value as the stored/compared idempotency and audit anchor. The client (`app/api/v1/imports/confirm/route.ts` + `confirmationDigest` in `lib/canonical.ts`) computes the identical object — the frame scalars and the `rpcRows` (rows with server `fingerprint`/`sourceIndex` injected) — so the two digests agree byte-for-byte. This is server-authoritative: the caller digest is a verified claim, not the source of truth.
- Rationale: The prior digest was a trusted caller token used as the sole "same payload" discriminator, so materially different rows could be blessed under an unchanged claimed digest (the artifact-reuse path returned the original batch and silently discarded the divergent rows), and a fresh batch could persist rows whose recorded digest did not summarize them — corrupting the audit/backup/restore-equality chain. A digest that anchors idempotency and audit must be a function of the data it claims to summarize.
- Evidence: `supabase/migrations/202607240005_confirm_import_digest_binding.sql`, `supabase/tests/002_security_contracts.sql` (tamper test 19 fails before the fix, passes after), `lib/canonical.ts`, `app/api/v1/imports/confirm/route.ts`.

## D-013 — Restore manifest counts are canonical integers and the sequence range reserves increment headroom

- Date: 2026-07-25
- Status: Accepted
- Decision: `restore_backup` stage validation requires every `tableCounts[kind]` and descriptor `rowCount` to be canonical non-negative integer text (`^(0|[1-9][0-9]*)$`), rejecting fractional/`2.0`/leading-zero/signed forms with `invalid restore manifest descriptor` before any `text::integer` cast. The accepted `snapshotSequence` range is made explicit as `[0, 2^63-2]` (must be `< 9223372036854775807`) so the single post-commit increment (`sequence = restored + 1`) cannot overflow bigint. Restore round-trip integrity is proven by a populated fixture that exports a full ledger, rewrites the owner to a foreign id, wipes, restores, and asserts a re-export reproduces every table byte-for-byte and remaps all rows to the caller.
- Rationale: Counts were validated only as JSON `number`, so a fractional value slipped past the type check and blew up on an uncaught `22P02` cast instead of failing closed; and the sequence range admitted int64 maximum, which overflowed on the commit increment. Both are boundary defects in an authoritative recovery path. The empty-table restore test proved none of the insertion, money-canonicalization, FK-ordering, audit, or owner-remapping logic — a populated round-trip with re-export equality closes that gap.
- Consequences: Restore fixtures that hand-author populated payloads must avoid null row fields, because `restore_request`'s `jsonb_strip_nulls` recursively drops nulls from the chunk and breaks the chunk/aggregate digest binding (see GOTCHAS).
- Evidence: `supabase/migrations/202607240006_restore_count_and_sequence_bounds.sql`, `supabase/tests/003_restore_contracts.sql` (fractional-count and int64-max tests fail pre-006; populated round-trip asserts re-export equality and owner remapping), verified via `supabase db reset` + `supabase test db` with migration 006 held out then restored.

## D-014 — Row fingerprints are server-recomputed and rejected on mismatch, guarded by a source-text charset

- Date: 2026-07-25
- Status: Accepted
- Decision: `confirm_import` recomputes every row's fingerprint with `private.row_fingerprint` and raises `fingerprint mismatch` when the caller's claim differs, rather than silently overriding it. `private.normalize_source_text` mirrors `normalizeSourceText` in `lib/canonical.ts` (NFKC, then collapse the JS whitespace set — including U+FEFF, which NFKC does not fold and PostgreSQL `\s` does not match — then trim). `lib/statement.ts` constrains `transactionLabel`, `description`, `reference`, and `branch` to a fixed charset (ASCII, Latin-1/Extended, combining marks, Thai, general punctuation, currency, fullwidth forms, whitespace controls).
- Rationale: The fingerprint is the ledger deduplication key (`unique(owner_id, account_id, fingerprint)` + `on conflict do nothing`), so a claim that does not match its row could silently drop a real transaction or force a spurious dedup. The digest bound the rows including their fingerprints, but nothing bound a fingerprint to the row it claimed to identify. Reject-on-mismatch was chosen over the server-authoritative override originally proposed in PLAN: under both designs the server recomputes, so a future PostgreSQL major version shipping newer Unicode data could derive a different fingerprint for an already-stored transaction. Under override that silently misses the dedup key and inserts a **duplicate ledger row**; under reject it raises loudly at import time. Silent double-counting of real money is the worse failure. The charset guard makes that skew class unreachable rather than merely unlikely, so a mismatch now means tampering or a genuine bug.
- Consequences: Widening the source-text charset re-opens the NFKC skew risk and must be re-validated against PostgreSQL's Unicode data. pgTAP fixtures that need a specific fingerprint (deliberate collisions, wrong claims) must send it via `pg_temp.confirm(..., p_bind_fingerprints => false)`; overlap fixtures must instead carry identical fingerprint inputs so the collision is derived from row content.
- Evidence: `supabase/migrations/202607240007_fingerprint_functions.sql`, `supabase/migrations/202607240008_confirm_import_fingerprint_binding.sql`, `lib/statement.ts`, `supabase/tests/002_security_contracts.sql` (test 23 fails pre-008 with `caught: no exception`, other 29 pass; 84/84 after `supabase db reset` applying 001–008), `tests/domain.test.ts` (charset boundary tests incl. U+1CCF0), SQL/JS parity harness 0 mismatches over 6 fingerprint cases and 50k realistic-charset strings.

## D-015 — Krungthai geometry is read from the pdf.js text layer against invented fixtures

- Date: 2026-07-25
- Status: Accepted
- Decision: `lib/krungthai-layout.ts` reads the transaction grid from positioned text items rather than PDF bytes, and fixtures (`tests/fixtures/krungthai-layout-v1.ts`) are authored as pdf.js-shaped `{str, x, y}` arrays instead of generated or committed PDFs. Columns are located from a heading line carrying every anchor; each column owns the band from its anchor to the next; a dateless following line is a wrapped detail line for the row above. The worker now extracts rows instead of returning `LAYOUT_V1_UNSUPPORTED_DOCUMENT`, and posts back only rows or a typed error code — never raw page text.
- Rationale: The risk being managed is column and row assignment, not PDF decoding, which pdf.js already handles. Text-layer fixtures add no dependency, keep geometry reviewable in a diff (a column position is a number, not an opaque blob), and keep tests fast and debuggable. Generated PDFs would add a build-time dependency for fidelity to a layer that is not where the defects live; committed binary PDFs cannot be reviewed or adjusted.
- Consequences: The fixture geometry is invented per `docs/FIXTURE_POLICY.md`, so the extractor is proven correct against a synthetic layout only — agreement with a real Krungthai PDF is unverified until the authorized smoke test (PLAN "Later authorization gates" 1). The pdf.js integration itself (transform extraction, page iteration) is not covered by tests. The statement frame is still unextracted, so a PDF cannot yet yield a confirmable payload; the UI reports the row count and stops.
- Evidence: `lib/krungthai-layout.ts`, `workers/krungthai.worker.ts`, `tests/krungthai-layout.test.ts` (13 tests: 6 extraction, 7 fail-closed), `docs/KRUNGTHAI_CONTRACT.md`. Reconciliation assertion confirmed distinguishing by desyncing the opening balance by one satang and observing a blocker.

## D-016 — The statement frame is extracted from labelled pairs and reduced to last four at the parser

- Date: 2026-07-25
- Status: Accepted
- Decision: `extractStatement` reads the frame block above the transaction grid on page one — account type, account number, period, opening balance, closing balance, and an explicit THB marker — taking each value from whatever is printed to the right of its label on the same line. The account number is reduced to its last four digits inside the extractor, so no full account number is ever returned. The extracted period end year anchors every two-digit year in the statement, including its own start date. A final cross-check rejects a statement whose last row balance disagrees with the printed closing balance (`CLOSING_BALANCE_MISMATCH`).
- Rationale: Label-relative reading suits a frame, where fields are printed as label/value pairs rather than in fixed columns, and it degrades to a typed `MISSING_FRAME_FIELD` rather than a mis-parse when a label is absent. Reducing to last four at the point of extraction rather than downstream means no later code path, log line, or error message can leak a full account number — the value simply never exists past the parser, which is stronger than redacting it later. Anchoring years on the extracted period end rather than the current year (the prior shortcut) makes parsing deterministic: the same PDF yields the same dates whenever it is read. The closing-balance cross-check catches dropped or misread rows, which row-level validation cannot detect on its own.
- Consequences: Binding an extracted statement to a ledger account is still unimplemented and deliberately so — which `accounts` row a last-four maps to is a user decision the parser must not infer — so a PDF still cannot produce a confirmable payload without that step.
- Evidence: `lib/krungthai-layout.ts`, `tests/krungthai-layout.test.ts` (27 tests; 11 frame-specific, including one asserting the full printed number does not survive extraction), `tests/fixtures/krungthai-layout-v1.ts`, `docs/KRUNGTHAI_CONTRACT.md`. Gate: 59 passed / 1 skipped, ESLint, tsc, production build.

## D-017 — Account binding is a checked user decision, not a parser inference

- Date: 2026-07-25
- Status: Accepted
- Decision: `lib/import-assembly.ts` turns an extracted statement into a confirmable `ImportPayload`. The target account is an input, never inferred from the PDF, but the binding is verified rather than trusted: the chosen account's last four digits and currency must match what was printed, and the rows must reconcile from the printed opening balance, before `importPayloadSchema` is applied as the final authority.
- Rationale: The parser reads an account's last four digits but cannot know which ledger account they belong to — two accounts can share a suffix, and the mapping is the owner's to make. Taking it as input alone would let a mis-click post one account's transactions into another's ledger, which is silent and expensive in an append-only ledger. Checking the printed last four and currency against the chosen account makes that specific mistake impossible without adding an inference. Reconciling client-side duplicates a server check deliberately: the server is still authoritative, but failing here keeps blockers visible next to the rows that caused them.
- Consequences: An account whose last four is unknown to the ledger cannot be bound until the owner records it. The HTTP path is still unexercised — see PLAN task 3 for the two blockers (local auth env is out of scope to inspect, and owner identity requires Google OAuth, an explicit authorization gate).
- Evidence: `lib/import-assembly.ts`, `tests/import-assembly.test.ts` (6 tests, including account/currency mismatch, a non-reconciling row, and a charset violation, plus one that mirrors the confirm route's fingerprint + digest steps).

## D-018 — Advisory lock serialization is proven with two real connections

- Date: 2026-07-25
- Status: Accepted
- Decision: `tests/advisory-lock.test.ts` verifies the owner mutation advisory lock by contending for it from two separate PostgreSQL connections: a tagged holder session takes `pg_advisory_xact_lock(hashtextextended(owner || ':ledger-mutation', 0))` and sleeps, while a second session attempts the same key under `lock_timeout`. Three properties are asserted — the same owner is blocked (55P03), a different owner is not, and the lock frees when the holding backend ends.
- Rationale: pgTAP cannot cover this. Its tests run in one session inside one transaction, and a session that already holds an advisory lock re-acquires it without blocking, so a single-session assertion passes whether or not the lock does anything — it is not a distinguishing test. The different-owner case is the control that makes the same-owner timeout meaningful: without it, a `tryAcquire` that failed for any unrelated reason would look like correct serialization.
- Consequences: The test needs the local container and skips loudly when it is unreachable, so a skipped run is not evidence of serialization. It exercises the lock key directly rather than through the RPCs, because reaching those needs an authenticated owner (PLAN task 3, blocked).
- Evidence: `tests/advisory-lock.test.ts` (3 assertions, ~5s), GOTCHAS entries on blocked-event-loop stdin starvation and `docker exec` kill semantics, both found while building it.

## D-019 — The recovery chain is proven end to end at scale, non-destructively

- Date: 2026-07-25
- Status: Accepted
- Decision: `tests/backup-roundtrip.test.ts` drives the whole schema-v2 chain over 1,200 source transactions: export, contract validation, encrypt, decrypt, staged restore with all eleven chunks in order, commit, and re-export equality. It exports whatever the database already holds before starting and restores that snapshot in a `finally`, so a full run leaves the ledger exactly as it found it.
- Rationale: pgTAP proves the restore contract with small hand-authored fixtures and the unit suite proves the envelope in isolation; neither exercises the chain at a size where chunk ordering, row counts, and int64-as-text handling actually matter, which is where a recovery path fails in practice. Non-destructiveness matters because the test necessarily commits — without restoring the prior state it would silently wipe the seed and break the pgTAP suites that assume it.
- Consequences: The test needs the local container and skips loudly when unreachable. Because it recomputes digests from whatever snapshot it is given, it proves round-trip fidelity rather than digest tampering — tamper detection stays covered by pgTAP `003`. Restores clear the destination first, matching `restore_backup`'s refusal to overwrite a non-empty ledger.
- Evidence: `tests/backup-roundtrip.test.ts` (1,200 rows, ~3s). Confirmed distinguishing by altering one `post_balance_minor` among 1,200 rows before restore and observing the re-export equality assertion fail. Non-destructiveness confirmed by running `supabase test db` afterwards: still 84/84.

## D-020 — The authenticated import path is proven with a local owner, no hosted resources

- Date: 2026-07-25
- Status: Accepted
- Decision: `tests/import-confirm-e2e.test.ts` signs in as the seeded synthetic owner, enrolls and verifies two TOTP factors to reach aal2, and posts a real `confirm_import` request whose fingerprints and payload digest were computed by `lib/canonical.ts` from a statement read by the real parser. It asserts the import lands, that a tampered fingerprint is rejected with `fingerprint mismatch`, and that the identical request without MFA is refused with `strong owner access required`.
- Rationale: Everything hardened in D-012 and D-014 was previously proven only at the SQL and unit level — the pgTAP wrapper computes fingerprints server-side in `pg_temp`, so it shows the SQL is self-consistent, not that a real client's values are accepted. No hosted Supabase or Google OAuth resources were needed: `private.has_strong_owner_access` checks `auth.uid()`, an aal2 claim, and two verified TOTP factors, and never inspects the auth provider, so a local password session satisfies it exactly as a Google identity would. TOTP codes are generated in-test from the secret Supabase returns at enrollment (RFC 6238), so no authenticator app is involved.
- Consequences: `public.ledger_owners` binds exactly one owner and is immutable, so the test authenticates as the seeded owner rather than creating a second one — a genuinely different owner cannot exist without a database reset. The test targets PostgREST rather than the Next.js route, so the route's zod boundary and cookie handling remain uncovered; the fingerprint and digest computation it performs is mirrored line for line from the route. The suite now runs files serially (`fileParallelism: false`) because several suites mutate the one local database.
- Evidence: `tests/import-confirm-e2e.test.ts` (4 assertions), `vitest.config.ts`. Full gate after the change: Vitest 75 passed / 4 skipped, pgTAP 84/84, ESLint, tsc, production build.

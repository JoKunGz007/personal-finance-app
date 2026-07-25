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

## D-021 — A statement becomes an import through a chooser, not a code path

- Date: 2026-07-25
- Status: Accepted. Closes the open consequence recorded in D-017 (binding had no user-facing step) and, with D-022, the route-coverage consequence recorded in D-020.
- Decision: `GET /api/v1/accounts` lists the owner's accounts, and `app/ledger-app.tsx` gained a bind stage between parsing and review: the owner loads their accounts, picks one, and only then is `assembleImportPayload` applied and the result posted to `/api/v1/imports/confirm`. The endpoint is an RLS-protected select of an explicit column list (`lib/accounts.ts` is the shared wire contract), not a new RPC. The artifact digest is the SHA-256 of the PDF's own bytes, computed on the main thread before the buffer is transferred to the worker. One idempotency key is minted per bound statement, so a failed confirmation can be retried without becoming a second import.
- Rationale: Everything under the UI already worked — extraction, assembly, confirmation — but only a test wired them together, so the app could not turn a PDF into a ledger entry. A plain select suffices where `list_account_transactions` needed an RPC: accounts carry no nested shape to assemble and no column wider than the last four digits exists to withhold, so the existing `strong_owner_select` policy is the whole enforcement. Digesting the bytes before transfer is the only point where they are still readable on the main thread; a digest cannot be reversed into statement content, and it is what makes re-importing the same PDF a detectable conflict rather than a duplicate ledger.
- Consequences: The `.pldemo` export is now offered only on the synthetic path — wrapping real confirmed rows in a file that calls itself synthetic would misdescribe the artifact. The binding chooser is unexercised in a browser: reaching it needs a real PDF, so Playwright still covers only the synthetic review path, and the flow's parts are covered separately by `tests/import-route.test.ts` and `tests/import-assembly.test.ts`. Binding stays a checked user decision (D-017) — a guard in `tests/privacy.test.ts` fails if the UI ever matches an account to the statement automatically.
- Evidence: `app/api/v1/accounts/route.ts`, `lib/accounts.ts`, `lib/canonical.ts` (`sha256HexBytes`), `app/ledger-app.tsx`, `tests/privacy.test.ts` (10 tests, 3 new). Gate: ESLint, tsc, Vitest 87 passed / 5 skipped, pgTAP 84/84, production build, Playwright 4/4.

## D-022 — The route wrapper is tested by invoking the handler with a real cookie session

- Date: 2026-07-25
- Status: Accepted
- Decision: `tests/import-route.test.ts` imports the actual Next.js handler functions and mocks only `next/headers`, backing it with a cookie jar that `@supabase/ssr` itself populates from a real aal2 session via `setSession`. It covers the confirm route's zod boundary (unknown fields, uppercase digest, malformed key, missing key, wrong currency, non-JSON body), its 409 idempotency translation, its route-only `AMBIGUOUS_DUPLICATES` check, and its computed fingerprints and digest, plus the accounts route's shape and both routes' 401/403 refusals. The local-stack harness (`psql`, RFC 6238 TOTP, aal2 sign-in, owner cleanup) moved to `tests/helpers/local-owner.ts` and is shared with the PostgREST suite.
- Rationale: D-020 closed the database half of the import path but left the route wrapper verified only by reading — its fingerprint and digest computation was mirrored by hand into the PostgREST test, and equivalence by inspection is not evidence. Letting `@supabase/ssr` write the session cookie means the test never hardcodes a cookie name or encoding, so it exercises the same storage the running app uses rather than a guess at it. Invoking the handler directly rather than starting a Next server keeps it in the same suite as the database it asserts against.
- Consequences: The negative-auth cases run last on purpose — signing in again at aal1 replaces the stored session, and a token refreshed in that family is no longer aal2, so restoring the strong session mid-file made the suite order-dependent (see GOTCHAS). Route coverage is now real but still bypasses Next's own routing, headers, and middleware; only Playwright reaches those, and it cannot reach the authenticated path without a PDF.
- Evidence: `tests/import-route.test.ts` (9 assertions), `tests/helpers/local-owner.ts`, `tests/import-confirm-e2e.test.ts` (refactored onto the shared harness, still 4 passed / 1 skipped). Gate: Vitest 87 passed / 5 skipped, pgTAP 84/84, ESLint, tsc, production build, Playwright 4/4.

## D-023 — pdf.js gets its own worker, and the browser parse path is tested with a generated PDF

- Date: 2026-07-25
- Status: Accepted
- Decision: `workers/krungthai.worker.ts` hands pdf.js an explicit `GlobalWorkerOptions.workerPort` built from a dedicated entry module (`workers/pdf.worker.entry.ts`, whose only job is to import `pdfjs-dist/build/pdf.worker.mjs`). `tests/fixtures/synthetic-pdf.ts` renders the existing invented geometry into a real PDF, and `tests/e2e/parser.spec.ts` drives the running app with it — one test asserts a full parse and the move to the bind stage, one asserts an unrelated PDF fails closed as `UNSUPPORTED_LAYOUT`. The worker now also returns the caught error's class name, and the UI shows it beside the typed code.
- Rationale: `GlobalWorkerOptions` had never been configured, so pdf.js fell back to loading its worker module inline and threw a bare `Error` before reading any page — every PDF was unparseable, and the app's most load-bearing integration was broken. Nothing caught it because nothing tested it: every parser test feeds `extractStatement` a `PageText` array directly, and the synthetic UI path fetches `/api/v1/demo` without touching the worker, so `getDocument` had never run in a browser. Generating the PDF from the invented fixtures keeps that coverage inside `docs/FIXTURE_POLICY.md` — no real statement is opened to test the reader. The font is Type0/Identity-H with an identity ToUnicode CMap and no embedded glyph program, because pdf.js recovers text from ToUnicode rather than outlines, so Thai extracts exactly without committing a font binary.
- Consequences: `workerSrc` pointed at the package path is not an alternative — the bundler inlines `pdf.worker.mjs` into the parser worker's own chunk, where it runs in that scope, replaces `self.onmessage`, and posts pdf.js protocol messages to the main thread (GOTCHAS). Returning the error class name is a deliberate, bounded disclosure: pdf.js names are library constants, never document content, and without them every failure except an unsupported layout read identically — which is what made the first real-statement attempt uninformative. Encrypted PDFs remain untested by generated fixtures; the generator writes no encryption dictionary, so the password path is still only exercised interactively.
- Evidence: `workers/krungthai.worker.ts`, `workers/pdf.worker.entry.ts`, `tests/fixtures/synthetic-pdf.ts`, `tests/e2e/parser.spec.ts`. Gate: ESLint, tsc, Vitest 87 passed / 5 skipped, Playwright 8/8 across desktop and mobile (was 4/4). Confirmed distinguishing: both new tests fail with `PDF_PARSE_FAILED / Error` on the pre-fix worker.

## D-024 — The column model follows a real statement, corrected by the smoke test

- Date: 2026-07-25
- Status: Accepted. Corrects the invented geometry of D-015 and D-016, whose column model no real statement could satisfy.
- Decision: The reader's columns are `Date/Time`, `Transaction`, `Description/Cheque No.`, `Withdrawal`, `Deposit`, `Balance`, `Branch`. Date and time share one cell, parsed together as `dd/mm/yy` with an optional `HH:MM(:SS)`. The transaction type and the description come from separate columns and map to `transactionLabel` and `description`. Thai wordings stay as alternates, since the contract allows either language. The fixtures in `tests/fixtures/krungthai-layout-v1.ts` now mirror this structure with entirely invented values, and the frame labels are English (`Account Type`, `Account No.`, `Period`, `Opening Balance`, `Closing Balance`).
- Rationale: The authorized smoke test reported `MISSING_COLUMN_ANCHOR`, and the on-device label diagnostic showed why: the statement prints one combined `Date/Time` column and a `Transaction` column that the invented model did not have at all. `findColumns` requires every anchor on one printed line, so the previous seven-anchor set could never match — the mismatch was structural, not a wording difference. Heading words are the bank's boilerplate rather than statement content, so adopting them copies no financial data; matching the real structure is what gives the fixtures any predictive value, which the invented shape demonstrably lacked. Only `Account Type` among the frame labels is confirmed — the others sit on lines the diagnostic redacts because they carry digits — so those remain guesses and both languages stay accepted.
- Consequences: A row whose date/time cell carries digits but does not parse now fails closed with a masked shape. Previously such a row was silently skipped when it was the first on a page, and merged into the preceding row's description otherwise — a dropped or corrupted transaction, found only because the restructure made the old "unreadable time" test pass for the wrong reason. Still unverified against reality: the date format inside the cell, the frame label wording, and every row-level value, because the real statement has not been re-read since this change. `pdf.js` v5 removed `disableCombineTextItems`, so a statement that printed its headings close enough to be merged into one run would fail closed and could not be read by this approach at all.
- Evidence: `lib/krungthai-layout.ts`, `tests/fixtures/krungthai-layout-v1.ts`, `tests/krungthai-layout.test.ts` (27 tests), `tests/e2e/parser.spec.ts`. Gate: ESLint, tsc, Vitest 88 passed / 5 skipped, pgTAP 84/84, Playwright 8/8 against a freshly built server.

## D-025 — The currency marker is searched across page one, not only the frame block

- Date: 2026-07-25
- Status: Accepted
- Decision: `extractFrame` tests the currency marker against all of page one rather than only the label block above the transaction grid. The fixtures print the marker below the grid, matching the real statement, and a test asserts the marker sits below the heading line so narrowing the region back fails in the suite.
- Rationale: The smoke test reported `UNSUPPORTED_CURRENCY`, and the allowlisted currency-token diagnostic answered why in one run: wording above the grid `none`, below `THB, Currency`. The statement does state its currency explicitly, satisfying the SPEC invariant — the reader was simply looking in the wrong half of the page.
- Consequences: This is a weaker guard than a frame-only match. A statement denominated in another currency that merely mentioned THB anywhere on page one would now satisfy it. Deliberately not paired with a foreign-currency-code scan: transaction descriptions legitimately contain codes such as `USD`, so that check would reject valid statements — a false rejection of real data is worse here than a theoretical false acceptance, because the hard enforcement is downstream where `parseThb` and the `THB` literal in `importPayloadSchema` refuse anything else.
- Evidence: `lib/krungthai-layout.ts`, `tests/krungthai-layout.test.ts` ("reads a currency stated below the transaction grid"), `tests/fixtures/krungthai-layout-v1.ts`.

## D-026 — The frame contract follows a real statement: no printed balances, two-line rows

- Date: 2026-07-25
- Status: Accepted. Corrects the invented frame of D-015/D-016 and supersedes the closing-balance guarantee recorded in D-024.
- Decision: Frame labels are `Account Number` and `Statement Period`; label matching collapses internal whitespace; a label's value stops at the next known label; and a label occurrence carrying no value no longer ends the search. Opening and closing balances are optional, because a real statement prints neither: when absent, the opening figure is derived as the first row's printed balance less that row's own movement, the closing figure is the last row's printed balance, and `StatementFrame.balancesPrinted` records which case applied. The closing cross-check runs only when a closing balance was printed. Each row's time is printed on its own line beneath its date in the same column and is merged back into the row.
- Rationale: Every item came from one masked structural dump of a real statement, which reports each line's shape and column positions with digits and letters replaced — no name, amount, balance, date, or account number left the device. It showed the frame carries Account Name/Type, Branch, Branch Code, Current Address, Overdraft Limit, Statement Period and Requested Date, and no balance of any kind; that rows occupy two printed lines; and that frame lines carry several label/value pairs on one line.
- Consequences: Three latent defects were fixed rather than shipped. Reading everything right of a label swept the neighbouring `Branch Code` digits into the account number, yielding a wrong but plausible account suffix — the worst class of error in an append-only ledger. The fail-closed guard from D-024 fired on any digit in the date column, so a footer address beginning with a street number aborted a statement that had parsed correctly; the probe is now date-shaped. An anchored label pattern rejected padded internal whitespace, which is invisible in every printed and reported form. The derivation also costs real safety: reconciliation can no longer detect a dropped *first* row, since the derived opening is defined to agree with it, and no printed closing figure remains to check the chain against. Rows two onward stay fully chain-checked. The last page carries a summary block — item count, total withdrawal and total deposit with counts — which would restore a global integrity check stronger than a closing balance; its label wordings are not yet known, so it is not read.
- Evidence: `lib/krungthai-layout.ts`, `tests/krungthai-layout.test.ts` (33 tests, including derived balances, a padded label, the neighbouring-field guard, and a time on its own line), `tests/fixtures/krungthai-layout-v1.ts`. Gate: ESLint, tsc, Vitest 95 passed / 5 skipped, Playwright 8/8.

## D-027 — Browser runs use an isolated Playwright config

- Date: 2026-07-25
- Status: Accepted
- Decision: `playwright.isolated.config.ts` runs the browser suite on port 3100 with `reuseExistingServer: false`, always building first. `playwright.config.ts` is unchanged and stays the convenient one for manual use.
- Rationale: The default config reuses anything already listening on port 3000, so a manually started `pnpm start` silently supplied a stale build. Four consecutive browser runs during the parser work reported identical failures against code that no longer existed, and each false result cost a real-statement read to notice. Isolation also means the owner driving the app by hand no longer has to stop their server before the suite can be trusted.
- Consequences: Two configs to keep in step. The isolated one is the one to trust for verification; a run through the default config is only as current as whatever server it found.
- Evidence: `playwright.isolated.config.ts`, GOTCHAS ("Playwright reuses a server someone else started").

## D-028 — The frame/grid boundary comes from the heading line, and the fixtures print the collision

- Date: 2026-07-25
- Status: Accepted
- Decision: `findColumns` returns the `y` of the line carrying all seven column headings alongside their x positions, and `extractStatement` uses that `y` as `headerY` — the single boundary separating the frame block from the rows. The any-anchor search it replaces is gone, not narrowed. The fixtures print a `Branch` frame label with a branch value on its own line between `Statement Period`/`Account Type` above and `Account Number` below, so the collision and its printed order are part of the default frame every frame test uses.
- Rationale: A real statement prints `Branch` as a frame label above the grid, and `Branch` is also a column heading, so taking `headerY` from the first line matching *any* anchor put the boundary on that frame line; `extractFrame` filters to `y > headerY + LINE_TOLERANCE` and dropped every field printed below it. The fields printed higher up still read, which is why attempt 6 reported `account number (label not found)` and looked like a per-field wording problem rather than a boundary bug. `findColumns` already located the true header correctly — it requires all seven anchors on one line — and merely discarded which line matched, so the fix is to stop throwing that away. `Branch` is not special-cased: any frame label equal to a column heading (`Balance`, `Transaction`, …) reproduces this, and a word-level exception would leave the class open.
- Consequences: `currencyEvidence`'s above/below split now also reports against the true grid line, so the D-025 diagnostic is more accurate than when it was written. Making the collision part of the *default* frame rather than one isolated case means the whole frame suite guards it, at the cost that a future fixture change moving those y values could reintroduce a silent green — the named regression test asserts the printed order explicitly for that reason. Balances remain derived (D-026); this fix restores no protection there, and the summary-block cross-check in PLAN task 8 is still the thing that would.
- Evidence: `lib/krungthai-layout.ts` (`findColumns`, `extractStatement`), `tests/fixtures/krungthai-layout-v1.ts`, `tests/krungthai-layout.test.ts` ("finds the grid header even when a frame label matches a column heading", 32 tests). Gate on 2026-07-25 with the project-local Node 24.18.0 runtime: ESLint, `tsc --noEmit`, Vitest 96 passed / 5 skipped against the live container, pgTAP 84/84, production build, Playwright 8/8 via `--config=playwright.isolated.config.ts`. Confirmed distinguishing: restoring the any-anchor `headerY` fails 26 of the 32 layout tests, each reporting the real statement's message verbatim — `The statement frame has no account number (label not found). Fields that did read: account type, statement period.` **Confirmed against reality 2026-07-25:** a masked structural dump of the real statement shows `Branch` printed as a frame label at `y=717` and the grid heading line at `y=601`, and the account number now reads.

## D-029 — A printed zero money column is no movement, not a rejection

- Date: 2026-07-25
- Status: Accepted
- Decision: A money column printing `0.00` contributes no component to its row. It is not a zero-amount component and not a rejection. A *negative* figure is still refused (`withdrawal column is negative.`), and a row where both columns printed zero fails closed with `no movement in either money column.`
- Rationale: A real statement prints its withholding-tax column as `0.00` on an interest posting where no tax was withheld — Thai withholding only applies above an annual threshold, so this is the common case, not an edge one. Rejecting it stopped a statement that had already read ~118 rows. Nothing moved, so nothing belongs in the ledger and the balance chain is unaffected either way. The sign asymmetry is deliberate: these columns print unsigned, so a sign would mean the statement encodes direction some other way, and reading a credit as a withdrawal would invert a real transaction — the worst failure mode this ledger has.
- Consequences: The interest/tax compound guard no longer applies to a zero-tax interest row, because that row now has one component rather than two — which is correct, but it means the guard covers strictly fewer rows than before. A printed `0.00` is not preserved anywhere in the import: the row is represented by its single component and its printed balance, so the fact that the bank printed a zero column is not auditable after import. Accepted as immaterial, since a zero carries no financial information.
- Evidence: `lib/krungthai-layout.ts` (`toRow`), `tests/krungthai-layout.test.ts` ("reads a printed zero money column as no movement", "rejects a negative money column rather than guessing its direction", "rejects a row whose money columns both printed zero"). Found by the masked cell dump on a real statement: `withdrawal[d.dd]` with no sign, on a row whose deposit had already passed its own positive check.

## D-030 — Columns are assigned by a run's midpoint, using the width pdf.js reports

- Date: 2026-07-25
- Status: Accepted. Corrects the left-edge banding introduced with D-015.
- Decision: `TextItem` carries the run's `width` as pdf.js reports it, and `assign` places a run by its horizontal midpoint rather than its left edge. The `LINE_TOLERANCE` left-overhang allowance is removed. A fixture that omits `width` falls back to a nominal per-character estimate, so there is one assignment rule rather than two code paths.
- Rationale: The text columns are left-aligned but the money and branch columns are right-aligned, so a wider figure starts further left. Measured on a real statement: the balance column is right-aligned to ~518 with a digit width of 4, so a `d,ddd.dd` balance starts at 491 but a `dd,ddd.dd` balance starts at 487 — below the 489 boundary, landing it in the deposit band. The statement crossed 10,000 baht on page 7 and failed with two amounts in `deposit` and an empty `balance`. A midpoint moves half a glyph per extra character where a left edge moves a whole one, and it correctly places every run in the real statement's dump, headings included. A 7-digit branch code was the same latent failure — `dddddd@533` sat exactly on the branch boundary with zero margin.
- Consequences: The reader now depends on pdf.js supplying `width`; it is optional in the type only so hand-written fixtures stay readable, and a fixture's estimate is invented rather than measured. This failed closed rather than silently — all three misfiling paths end in a rejection — but "fails closed" was the only protection, and the margin was 2 units.
- Evidence: `lib/krungthai-layout.ts` (`centreOf`, `assign`), `workers/krungthai.worker.ts`, `tests/krungthai-layout.test.ts` ("assigns a right-aligned amount by its midpoint, not its left edge"). Confirmed distinguishing: restoring the left-edge rule fails that test with `deposit[d.dd dd,ddd.dd] balance[]` — the same shape the real statement produced. Verified through real pdf.js widths by `tests/e2e/parser.spec.ts`.

## D-031 — The statement's calendar era is determined once, from its period end

- Date: 2026-07-25
- Status: Accepted. Replaces `resolveKrungthaiYear`, which assumed Buddhist Era unconditionally.
- Decision: `resolveStatementEra` reads the frame's period-end year in both calendars and keeps whichever lands inside a plausible window for an importable statement (20 years back, 1 year forward). Exactly one can, because the two readings are always 543 years apart and the window is narrower than that; if neither fits it throws and the frame fails closed with `INVALID_FRAME_CONTENT`, and the unreachable both-fit branch throws rather than choosing. The resolved era is threaded to every row through `gregorianYearFrom`, so a statement is never read half in one calendar. The era is returned beside the frame, not inside `StatementFrame`, which is hashed into the import digest.
- Rationale: A real English-language statement prints `26` for 2026. Read as Buddhist 2569 that is 1983, and `2500 + 26 - 543 = 1983` is exactly what the bind screen showed. Every row inherited the same 43-year shift, because rows anchor on the period-end year. **This is the first defect in the sequence that did not fail closed** — the statement parsed cleanly, reached the bind stage, and would have written 1983 dates into an append-only ledger. It was caught only because the bind screen prints the period. Determining the era from the 543-year separation is arithmetic, not a heuristic: a test walks all 100 two-digit years and asserts the ambiguous branch is unreachable (Gregorian admits 06–27, Buddhist 49–70, disjoint).
- Consequences: A statement older than 20 years, or dated more than a year ahead, is now refused outright — deliberate, since neither is importable and the alternative is a silent 43-year error. The window cannot be widened past ~43 years without making the two calendars genuinely ambiguous; the guard makes that failure loud rather than silent. Era detection rests on the period end being present and parseable, which D-026 already requires. The same fix corrected an adjacent defect: the period *start* previously inherited the end's year outright, so a range crossing a new year dated the start a year late — it now resolves its own printed year in the resolved era, which is what revealed the real statement's period to be 13 months (2025-07-01 to 2026-07-31) rather than one.
- Evidence: `lib/dates.ts` (`resolveStatementEra`, `gregorianYearFrom`, `StatementEra`), `lib/krungthai-layout.ts` (`extractFrame`, `toRow`), `tests/domain.test.ts` ("decides the statement era from its period end, refusing an implausible year"), `tests/krungthai-layout.test.ts` ("reads a statement printed in Gregorian years rather than as Buddhist 1983", "resolves a period start that crosses a new year against its own printed year"). Gate: ESLint, tsc, Vitest 106 passed / 5 skipped, pgTAP 84/84, production build, Playwright 8/8 isolated.

## D-032 — Row diagnosis is batched and deduplicated, not serialized one defect per read

- Date: 2026-07-25
- Status: Accepted
- Decision: `extractStatement` no longer returns on the first unreadable row. It parses every row, collects failures, groups them by their masked message with the page/row prefix stripped, and returns up to six distinct classes with counts. The import still fails closed — a statement with any unreadable row returns `ok: false` and no rows — and the reported code is the first failure's, so a single-defect statement reports exactly what it did before.
- Rationale: Reading one real statement cost seven owner-driven runs, each requiring the owner present to type a document password, because each run surfaced one row's failure and stopped. Rows repeat their shapes, so a statement's remaining defects collapse to a handful of classes that one read can return. This is a diagnosis change, not a validation change: what is accepted is unchanged, and the aggregate message is built from the same already-masked per-row messages, so it adds no disclosure.
- Consequences: A statement with many distinct defects reports at most six classes and says how many were omitted. The date-probe failure inside the line loop now records a failure and clears the current row rather than returning, so an unreadable row can no longer be folded into the one above it. Reporting is bounded but a pathological file could still produce a long status line.
- Evidence: `lib/krungthai-layout.ts` (`summarizeFailures`, `RowFailure`), `tests/krungthai-layout.test.ts` ("reports every unreadable row in one result, grouped by shape"), `tests/privacy.test.ts` ("reduces a rejected row to shapes, with no value or wording surviving").

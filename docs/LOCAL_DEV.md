# Local development & validation

System Node is v20. Use the ignored project-local runtime in PowerShell before any `pnpm` command:

```powershell
$nodeDir = "D:\Projects\personal-finance-app\.runtime\node-v24.18.0-win-x64"
$env:PATH = "$nodeDir;$env:PATH"
$env:COREPACK_HOME = "D:\Projects\personal-finance-app\.runtime\corepack"
pnpm --version
```

A clean frozen install succeeds offline after explicitly allowing build scripts only for `esbuild`, `sharp`, `supabase`, and `unrs-resolver`. **That allowlist is committed as of 2026-08-11** (D-095): `pnpm-workspace.yaml` carries the `allowBuilds` map, so a fresh clone installs without hand-editing it. It previously held pnpm 10's `onlyBuiltDependencies` and a fresh clone met `ERR_PNPM_IGNORED_BUILDS`, which is why hosting could not build (GOTCHAS).

## Validation order

```powershell
pnpm install --frozen-lockfile --offline
pnpm lint
pnpm typecheck
pnpm check:docs --strict
pnpm test
pnpm supabase:reset
pnpm supabase:test
pnpm build
pnpm exec playwright test --config=playwright.isolated.config.ts
pnpm exec playwright test --config=playwright.owner.config.ts
```

**The order above assumes no new migration, and it inverts when there is one: `pnpm supabase:reset` must come *before* `pnpm test`.** The suite runs against a live database, so a migration that exists in the tree but not in the project makes every database-backed test fail on a missing relation or an old function definition — failures that say nothing about the change and hide whatever the change actually broke. The reverse order is only safe because a reset after the tests re-establishes a clean database for the pgTAP run that follows it. This is not a rare case: migrations 015 and 016 both required it, and both were caught by hitting it. Bring the recovery destination to the new migration too — `node scripts/recovery-destination.mjs down` then `up`, since `up` alone leaves an earlier run's rows behind and a non-empty destination makes portable recovery *fail* rather than skip.

`pnpm check:docs` is structural only: it fails when a continuity document contradicts the tree or itself — a duplicate or missing decision id, an index that has drifted from its entries, a `D-0NN` citation with no entry, a backtick-quoted repo path that is neither present nor a recorded retirement, a dead relative link, or a file over its **byte** budget. It does not read for meaning; `/sync-continuity` does that (D-082). **The budget was in lines until 2026-08-18 and that measured the wrong thing** (D-130): `DECISIONS.md` passed at 1,132 of 1,200 lines while being 332 KB, because its entries are long paragraphs and it grew sideways. A passing run now prints each budgeted file's size and percentage, so the approach to a limit is visible rather than arriving as a surprise. **`--strict` is now part of the order above**, since every trap carries a date as of 2026-08-10 (D-085) and the warning it was tolerating is gone — so a new undated trap fails the gate rather than adding to a backlog.

Use the isolated config rather than `pnpm test:e2e`: the default one reuses a server someone else left running, so a browser run can silently test stale code (D-027).

The owner config is a second browser suite, for the specs that need a signed-in owner — the binding chooser, the authenticated import path, the charset rejection path, and since 2026-08-10 the real sign-in surface. It builds with `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1`, which is what makes the development sign-in exist at all (D-036); no other build has it. It also sets **`workers: 1`**, which is load-bearing rather than tidy: `fullyParallel: false` serialises a file and not a suite, so without it the two owner spec files run at once against the same seeded owner (GOTCHAS). Both browser suites and `pnpm test` share one database and one owner, and all three want an account ending 7890, so each cleans up after itself — see GOTCHAS if you meet a `accounts_owner_id_bank_code_last_four_key` violation.

**Driving the app by hand: the "Sign in with Google" button will not work on this machine, and that is not a defect.** It is the real login (D-091), and it needs a Google OAuth provider configured against a Supabase project — which no local project has and task 19 has not yet been authorised to create. Use the **Dev sign-in** button beside it, which mints the same `aal2` session locally. The two-factor screens between them are reachable with `curl -X POST 'http://127.0.0.1:3000/api/v1/dev/session?stop=aal1'` from this machine, after clearing `auth.mfa_factors` for the owner; that is exactly what `tests/e2e/owner-access.spec.ts` does.

## Three Supabase projects, and which is which

| Project | Ports | Holds | `down` |
| --- | --- | --- | --- |
| `private-ledger-local` | 5432x | Synthetic seed only. **Every suite, seed and pgTAP fixture targets this.** Disposable | `pnpm supabase:stop` |
| `private-ledger-recovery` | 5433x | Nothing; a destination for proving a backup restores | discards its data |
| `private-ledger-live` | 5434x | **Historical** real records (D-048), frozen on migration 012 since the hosted project became the real ledger (D-094). Studio on 54343 | preserves its data |

```powershell
node scripts/live-ledger.mjs up      # start / migrate / bind
node scripts/live-ledger.mjs status  # what is actually in there
node scripts/live-ledger.mjs down    # stop, data preserved
```

Point the app at the live ledger by setting `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54341` in `.env.local`. The browser suites pin the test project explicitly, so a `.env.local` aimed at the live ledger cannot drag them onto real data.

**Never run the suites against the live ledger.** The wipes in `tests/helpers/local-owner.ts` are owner-scoped, not test-scoped, so they delete every row the owner has. `assertOnlyDisposableLedgerData` refuses when it finds an account neither the seed nor the suite created; `pnpm supabase:reset` cannot be guarded at all.

`tests/recovery-portability.test.ts` skips unless the recovery project is also running, and a skipped run proves nothing about recovery. Start it first, and stop it afterwards — it is disposable by design:

```powershell
node scripts/recovery-destination.mjs up
node scripts/recovery-destination.mjs down
```

See `docs/RECOVERY.md` § Portable recovery rehearsal for what it does and does not establish.

The masking harness is run on demand, never as part of validation, and needs the owner present to type a document password:

```powershell
node scripts/mask-statement.mjs private-statements/<folder> --label <format>
```

It takes a directory or a single PDF. For a directory it walks every PDF beneath it, asks for the password **once** and reuses it, re-asking only for a document that one does not open, and writes `<format>-01.md`, `<format>-02.md`, … in sorted order. File names are masked in both the dumps and the console output, so no real name is typed or read (D-035).

### Sharing a statement with an agent

Masked dumps come first; reach for this only when a dump has proven insufficient. `scripts/repassword-pdfs.py` re-encrypts statements under a disposable password so the originals' identity-grade one never leaves the owner's hands (D-049). It is a Python tool — `pip install pikepdf`, using system Python rather than the project's Node runtime, and it is not a project dependency.

```powershell
python scripts/repassword-pdfs.py self-test
python scripts/repassword-pdfs.py archive --src private-statements --yes-rewrite-originals
python scripts/repassword-pdfs.py copy --src private-statements --dest shared-statements --decrypt
```

The order is the point. `archive` runs **first** and rotates the owner's own files in place, off the bank's date-of-birth-and-citizen-ID password and onto one he chooses; it writes and verifies a replacement before `os.replace` touches anything. `copy` then writes plain, password-free copies for an agent to read, leaving the originals untouched. Encrypting those copies would protect nothing, since the agent would need the password to read them — the exposure that mattered was closed by the first command, not the second.

KBANK and SCB share one password and Krungthai uses another, so the `archive` step is run **twice**, once per bank password, both times onto the same new one — which collapses two passwords into one and makes the later `copy` a single run. A run reports the files its password did not open and leaves them completely alone, so nothing needs sorting by bank.

Passwords are typed at a hidden prompt and are never arguments, environment variables or files. `--dry-run` previews either mode, `--generate` invents a new password (rejected with `--decrypt`, which has none to invent), and `self-test` proves rotation, decryption and archive replacement on generated PDFs without touching a real statement.

## Docker / Supabase acceptance

Docker acceptance uses only the `private-ledger-local` Supabase project on `supabase_network_private-ledger-local` (its default Docker network — see `DECISIONS.md` D-008, D-009). Do not modify the older PostgreSQL/pgAdmin containers or the Windows PostgreSQL service.

## This machine

Moved from the retired `HANDOFF.md` (D-268). Each line is a reading; re-take it rather than trusting it.

**Local-only and ignored files.**

- `eslint.config.mjs` and `playwright.config.ts` are modified on purpose and never committed. Read `git status --short`, preserve both, and stage by explicit path, never `git add -A`. The local `playwright.config.ts` pins `GOOGLE_VISION_KEY` and all three `STATEMENT_MAILBOX_*` variables empty, ignores the owner specs, and deletes `.next` after a run through `.runtime/clear-next-build.ts`. A fresh clone has none of this.
- `statement-mailbox.json` is gitignored and holds no secret, but it names an address: never quote it. The mailbox is a separate Gmail account (D-189); its app password is the owner's and is read from stdin only.
- `GOOGLE_VISION_KEY` is in the owner's Windows user environment, so `next start` inherits it. Every throwaway browser config pins it to `""`.
- `.runtime/card-ocr-readings.tsv` holds real values and is the owner's to mark or delete. Always name the harness file when running `--config .runtime/vitest.harness.config.ts`, or every `*.harness.ts` runs and overwrites it.
- `shared-statements/`, `receipts_sample/` (including `shopee/`, `quick_check/`, `food_delivery/`), `phone_screenshots/` and `owner-notes/` hold real material. Never turn any of it into a fixture, a doc line or a commit; never quote `owner-notes/`.
- `dev-backup/` holds the owner's `.plbak` exports and a password map (temporary, 2026-10-03). On his word agents may read this folder only; never copy a password out of it, and delete the folder when he ends the arrangement.

**Hosted and deploys.**

- The real ledger is the hosted Supabase project; the app on Vercel serves it. The repo stays linked to it (`supabase ... --linked`; the CLI is `node_modules/.bin/supabase`, not on `PATH`). `--linked` can answer from local: check `inet_server_addr()` is non-local before trusting a hosted read.
- Every push to `main` deploys to production. The remedy for a bad deploy is Instant Rollback in the Vercel dashboard, never a revert push. Trust the commit hash, not the dashboard's relative time (UTC against UTC+7).
- A Ready badge is not a working page: check the deployed page itself.
- The browser pane has no file upload; Claude in Chrome's `file_upload` reaches the `/receipts` file input (21 screenshots, 3 MB, one call, 2026-10-17). Uploading opens a read-and-review list with a "Save all" button; nothing is stored until it is pressed.
- Mailbox Sync skips a 7-Eleven invoice mail carrying the IMAP keyword `PLReceipt`. To re-capture stored invoices (e.g. after a reader change), the owner runs `scripts/clear-receipt-flag.ts` (count only; `--clear` removes the keyword; build line in its header), then Sync.

**Local stack hazards** (traps with full write-ups are in `GOTCHAS.md`).

- `pnpm supabase:reset` cannot be guarded and destroys the project the working directory names. Never set `ALLOW_DESTRUCTIVE_TESTS=1` to get a green run.
- The auto-mode classifier refused `pnpm supabase:reset` on 2026-10-17. To add only a new migration to the running local stack, `node_modules/.bin/supabase migration up --local` applies the pending files without a reset (used for 060); a full rebuild still needs the owner to run the reset.
- `NEXT_PUBLIC_*` and the CSP are inlined at build time from `.env.local`, so a browser config that builds without pinning its target builds against whatever that file names.
- Docker Desktop stops often and has to be started by hand. With Docker down the database-backed suites **skip** and the totals look the same: run `docker ps` first and read the words, not the colour. An up-but-unreachable stack fails with `ECONNREFUSED` instead (the WinNAT port trap; the exclusion `54320–54349` is persistent machine state).
- After `supabase db reset` or restarting a `supabase_db_…` container, restart that project's `auth`, `rest`, `realtime`, `storage`, `pg_meta` and `kong` containers; they stay `(healthy)` on dead connections.
- The owner browser suite wipes the seeded owner's data before and after each test; run database-backed suites one at a time.
- `pnpm dev` started in the background and stopped with `TaskStop` leaves `next dev` holding port 3000. Find the PID (`netstat -ano | grep :3000`) and `taskkill /PID <pid> /F`.
- No app server is left running; both browser suites start their own on 3100 and 3200 with `reuseExistingServer: false`.
- Run `check:docs --strict` as its own command; piping it through `tail` makes `&&` guard `tail`'s exit code.
- `tests/recovery-portability.test.ts` skips without the recovery project and the totals read the same; read its named lines.

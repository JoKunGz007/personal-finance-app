# Private Ledger gotchas

Last reviewed: 2026-07-31

Record only repeatable, non-obvious traps. Each item states the symptom, cause, prevention, and verification.

**What a date on a `Verify:` line means, and what a backfilled one does not.** An ordinary date is the day the trap was checked against a running system. A clause reading **`Dated <date> from <sha>`** is weaker and deliberately says so: it was recovered on 2026-08-10 from the commit that introduced the code the trap is about, so it marks when the trap became *true* rather than when it was last confirmed *still* true. Neither kind is a promise that the trap holds today — that is what makes the date worth having, since a trap whose date is months behind the code it names is the one to re-read first. A date was never invented for an entry whose evidence could not be found; those stay undated, which is honest and is what `--strict` will keep failing on.

One hundred and thirteen traps, grouped on 2026-08-09 into the eight sections below and added to since. The grouping moved entries and changed nothing inside one; `Last reviewed` above is deliberately unchanged, because reorganising a file is not reviewing what it claims. The index lists every trap, so a reader can find the one that applies without loading the bodies.

## Index

### Environment, shell and toolchain

- Windows project ownership can block safe edits
- System Node is too old
- pnpm 11 requires an explicit build-script allowlist
- A hosted build succeeds without its environment variables
- Silent Python installers can outlive the calling shell
- The skill validator inherits the Windows locale encoding
- Untracked files are absent from ordinary diffs
- PowerShell mangles commit messages two different ways
- A blocked event loop silently starves a spawned child's stdin
- Plain Node can run this repo's TypeScript, but only a module that imports nothing
- An absolute Windows path is not a valid ESM specifier
- `Get-Content`/`Set-Content` mangles every em dash in a Markdown file
- A `.ps1` written as UTF-8 without a BOM is read as ANSI, so the script's own punctuation corrupts
- Redirecting a native command's stderr in PowerShell 5.1 reports failure at exit 0
- PowerShell prepends a UTF-8 BOM when piping into a native command
- `pnpm add` fails with `ERR_PNPM_UNEXPECTED_STORE`, and the suggested fix is the expensive one
- PowerShell eats a scoped package name before pnpm ever runs
- tesseract.js caches its language data into the process working directory
- pgTAP run straight after `pnpm test` fails in `001` on a foreign key, and the change is not the cause
- A PowerShell `**` path glob does not recurse, so the build's target check silently under-counts

### Docker and the local Supabase projects

- Custom Docker binding networks break Supabase DNS
- Local Supabase is development-only
- Unrelated PostgreSQL containers already exist
- A D-drive database is not an independent backup
- Killing `docker exec` does not stop the process inside the container
- `supabase db push --db-url` cannot reach a local container
- A stopped Docker makes the browser gate print all 18 test names and exit 0 without running one
- Restarting the Supabase database container breaks every host connection until its dependants restart too
- `supabase start` reports "already running" while its database container has exited

### Database, migrations and pgTAP

- `trigger_is` argument count is easy to misread
- JSON numbers cannot carry PostgreSQL bigint safely
- SQL `NULL` can bypass ordinary inequality checks
- Fingerprint-bound imports change what pgTAP fixtures may assert
- Order of checks in confirm_import decides which error a fixture sees
- A restore can leave the audit_events identity sequence behind an existing id
- A hard-coded literal inside a security-definer function can gate a whole feature silently
- An id remapped in every column can still survive inside jsonb
- Per-slip mutable state cannot be a column on `public.slips`
- A replica-mode wipe deletes parent rows without complaining about their children
- `create_cash_entry` bounds no date, while `capture_slip` bounds one
- `supabase db query --linked` can answer from the local database, and the CLI names neither
- A new table is NOT born with zero privileges, and grepping the migrations cannot tell you what it holds
- A version or count written into `SPEC.md` is a claim no gate re-reads

### Backup, restore and recovery

- Snapshot generation is not backup custody
- Restore sequence semantics must be exact
- `.pldemo` is intentionally non-restorable
- Schema version 1 has no upgrade promise
- `restore_request` strips nulls inside the chunk, breaking digest binding
- Restore counts must be canonical integers, not merely JSON numbers
- A wiped ledger and a wiped session look the same from a failing restore
- A cleanup helper that predates a migration makes the next restore fail, at commit, naming no table
- A wrong backup password and a corrupted backup file report identically
- A recovery destination can start non-empty, which makes portable recovery fail rather than skip

### Statement and slip parsing

- Deposit plus withdrawal is not sufficient anomaly evidence
- pdf.js needs its worker handed over explicitly, and pointing at the package path backfires
- A frame label that equals a column heading moves the grid header
- The summary block sits inside the row region, so it can be eaten by the last transaction
- A right-aligned number's left edge is not inside its own column
- A two-digit year on a Thai statement belongs to either calendar, and guessing wrong is silent
- A frame label's value runs into the next field on the same line
- An anchored label pattern rejects padded whitespace you cannot see
- A dense digit-free line is a transaction row as often as it is a heading
- A bank's name appears on other banks' statements
- Heading x positions do not bound the data columns, except on the layout you wrote them for
- A fixture that supplies its own run widths cannot test right-edge geometry
- A layout has one row date separator, not one date separator
- A Thai slip QR does not always decode at native screenshot resolution
- Stripping whitespace lets an unanchored numeric group swallow the next field
- A cross-checked statement can still fail the balance chain
- A payload that carries the repaired data reconciles clean, so the surface that should report the repair reports nothing
- A WebAssembly decoder resolves its binary next to the bundled chunk, so it 404s and fails silently
- A WASM core path naming a directory makes the engine ask for a file the build never copied

### Real data, masking and privacy

- Never use real statements to develop the parser
- Mis-decoded text hides in the character classes a masker leaves alone
- A folder of statements may contain something that is not a statement
- A masking parser that fails open prints exactly what it was written to hide
- The masked page-line dump cannot see what the reader did, and reading it as if it could produced a whole wrong diagnosis
- A "value-free" probe leaks values when its allow-list assumes a flat structure
- A placeholder that looks like a real value reads as a failed autofill
- A value-free reporting rule guards the print, not the reuse hours later

### Tests, Playwright and the gate

- Narrowing a threshold constant makes its tests pass for the wrong reason, not fail
- The synthetic path in the app UI does not exercise confirm_import
- Playwright reuses a server someone else started, so browser runs can test stale code
- A unit suite that feeds the layout reader fixtures proves nothing about reading a PDF
- Database-driving tests race each other under Vitest file parallelism
- Re-seeding the Supabase cookie jar per `describe` block makes every later test 403
- Leftover test accounts collide on a unique constraint in another suite
- `pnpm test` deletes every row the owner has, not just the test's own
- A bare tag locator is a contract only while the page holds one of that tag
- Running a browser suite leaves `.next` aimed at whatever that suite pinned
- Two of the three Playwright configs pin their Supabase target in git; the third's pin is uncommitted
- The isolated suite's "no dev sign-in" test fails once `.env.local` opts in
- Stubbing a browser API can hide which code path the test is exercising
- A source-grep test keeps passing after the thing it names becomes false
- Running the browser gate deletes whatever you captured by hand in the test project
- An axe pass on a route that loads nothing proves nothing about what the route renders
- `locator.click().catch(() => {})` does not skip a missing control, it burns the timeout
- A rediscovered trap is not a new one — check before adding an entry
- The default config runs the owner suite twice at once, so its two copies wipe each other's fixtures
- The default config gives `prebuild` and a full `next build` the 60-second webServer default
- `fullyParallel: false` serialises a file, not a suite, and looks serial while there is one file
- A config that ignores one spec file by name is a list of one, not a rule
- A 200 from the app proves a server is running, not that it is the one you just started

### App, auth, routing and accessibility

- Strict production CSP can block the Next.js development runtime
- Signing in again at aal1 downgrades a shared Supabase cookie session
- Only one ledger owner can ever exist locally
- A guard keyed on `NODE_ENV` is unreachable in the build that must exercise it
- A leftover TOTP factor makes a later sign-in unable to reach aal2
- Creating a ledger account before the import is proven leaves one that cannot be removed
- A `role="status"` added to a static notice breaks every existing spec that looks one up by role
- Splitting one page into routes breaks specs whose subject has nothing to do with routing
- A second `role="status"` in the shell makes every existing status assertion ambiguous
- An `aria-label` replaces a button's words rather than adding to them, and axe says nothing
- A control that disables itself takes the focus with it
- `readError` takes a parsed body, so handing it a `Response` silently shows the fallback

## Traps

### Environment, shell and toolchain

## Windows project ownership can block safe edits

- Symptom: the safe editor reports an incorrect folder owner or `Access is denied`.
- Cause: the project root ACL owner differs from the logged-in user.
- Avoid: repair only the exact project root from an elevated PowerShell session. Do not recursively change unrelated directories.
- Verify: a small `apply_patch` succeeds and `Get-Acl` reports the expected owner. **Checked live 2026-08-10 rather than dated from a commit — this one is about the machine, not the code, so the history could not answer it.** `Get-Acl` on the project root reports `JOHN_LEGION\jozak`, which is the logged-in user, so **the condition is not currently present**: the trap is kept for a fresh clone or a restored backup, not because it is live. Re-check after any move, restore or copy of the project root, which is when ownership changes.

## System Node is too old

- Symptom: ESM startup failures or inconsistent Next/Vitest behavior under Node 20.
- Cause: this project requires Node 24.
- Avoid: use the ignored project-local Node 24 runtime and pinned Corepack/pnpm until the system runtime is upgraded. Do not “fix” ESM errors by rewriting dependencies.
- Verify: the active `node --version` is 24.x and lint, typecheck, tests, and build pass. Dated 2026-07-24 from `628f4d6`, which added `docs/LOCAL_DEV.md` and its project-local Node 24 runtime instructions.

## pnpm 11 requires an explicit build-script allowlist

- Symptom: a clean install ends with `ERR_PNPM_IGNORED_BUILDS` after packages are linked.
- Cause: pnpm 11 replaced `onlyBuiltDependencies` with the stricter `allowBuilds` map.
- Avoid: review each pending lifecycle script and allow only the required named packages in `pnpm-workspace.yaml`; never enable all dependency builds.
- Verify: `pnpm install --frozen-lockfile --offline` succeeds and `pnpm ignored-builds` reports none.
- **Fixed for a fresh clone on 2026-08-11 (D-095).** The `allowBuilds` map is now committed, so this trap is closed everywhere rather than only on this machine. Until then the file's single commit `9203a87` carried pnpm 10's `onlyBuiltDependencies` naming three packages, and the map — which adds `unrs-resolver` and denies `tesseract.js` — lived only in the deliberately uncommitted working copy. **What proved it was a real blocker rather than a tidiness issue:** a frozen install on a clone of `HEAD` under pnpm 11.17.0 exits 1 with `ERR_PNPM_IGNORED_BUILDS` naming `esbuild@0.28.1`, `sharp@0.34.5`, `tesseract.js@7.0.0`, `unrs-resolver@1.12.2`. A hosted build clones `HEAD`, so it met exactly that.
- Note on the older provenance, kept because the correction is the lesson: this line once read `Dated 2026-07-25 from 5e4c5bb, the commit that introduced the named allowBuilds allowlist`. `git show 5e4c5bb -- pnpm-workspace.yaml` is empty, and no commit introduced `allowBuilds` until this one.

## A hosted build succeeds without its environment variables

- Symptom: a deployment builds green and the app loads, but nothing it shows ever comes from the database, and the browser console reports the requests as blocked by the content security policy rather than as failures anyone would trace to configuration.
- Cause: `next.config.ts` derives `connect-src` from `NEXT_PUBLIC_SUPABASE_URL` at build time, and `lib/security-headers.ts` fails **narrower** when that value is missing — `connect-src` becomes `'self'` alone. That is the correct direction to fail, but it is silent: nothing in `next build` requires the variable, so a build with no Supabase configuration at all is a successful build. `NEXT_PUBLIC_*` are inlined at build time, so the mistake is baked into the artifact rather than fixable by restarting anything.
- Avoid: set the variables **before the first deployment**, not after it, and treat a changed value as requiring a rebuild rather than a redeploy. Read the deployed `Content-Security-Policy` header and confirm `connect-src` names the intended Supabase origin and its `wss:` counterpart — the header is the only place the build's opinion of its own configuration is visible from outside.
- Verify: `curl -I <deployed-url>` and read `connect-src`. Confirmed 2026-08-12 against the hosted deployment, where it correctly named the hosted origin and its socket counterpart (D-096). The failure direction was confirmed separately the same day: a clone with no Supabase environment at all built to exit 0 and emitted the full route list.

## Silent Python installers can outlive the calling shell

- Symptom: a second Python installation logs Windows error `0x80070652`, or the launcher temporarily reports no installed runtime.
- Cause: the signed Python bootstrapper returned while its elevated engine and MSI packages were still running.
- Avoid: after launching the installer, wait for all `python-<version>-amd64` installer processes to exit before retrying or verifying. Do not start overlapping repairs.
- Verify: `%LOCALAPPDATA%\Programs\Python\Python314\python.exe --version`, pip, and `py -0p` all report the installed runtime. Dated 2026-07-24 from the Python 3.14.6 / PyYAML install recorded in `PLAN.md` for skill scaffolding that day.

## The skill validator inherits the Windows locale encoding

- Symptom: `quick_validate.py` raises a `UnicodeDecodeError` under the Thai Windows locale.
- Cause: the validator reads `SKILL.md` with the platform default encoding rather than forcing UTF-8.
- Avoid: keep project-local skill instructions in ASCII punctuation unless the validator is updated to specify UTF-8.
- Verify: the official `quick_validate.py` reports `Skill is valid!`. Dated 2026-07-24, the day `PLAN.md` records the project-local skill passing the official validator; treat it as dated rather than current, since the validator could not be located to re-run on 2026-07-28.

## Untracked files are absent from ordinary diffs

- Symptom: `git diff` appears empty even though most project files exist or changed.
- Cause: untracked files are not included in the normal diff.
- Avoid: pair `git status --short` with direct file inspection; do not infer that an empty diff means no work.
- Verify: review both tracked modifications and untracked paths before handoff. **Demonstrated live 2026-08-10**, not dated from a commit: an untracked probe file in the project root produced no output at all from `git diff --stat` while `git status --short` listed it as `??`. This is a permanent property of git rather than anything this repo configured, so it is re-checkable at any time by the same two commands — which is why it gets a current date rather than a backfilled one.

## PowerShell mangles commit messages two different ways

- Symptom one: `git commit -m @'…'@` fails with `error: pathspec 'word' did not match any file(s)` and a wall of message text quoted back as more pathspecs.
- Cause one: a here-string is only recognized when `@'` is the last thing on its line. A single trailing space after it silently makes it not a here-string, so PowerShell word-splits the message and every apostrophe inside starts a new quoted token.
- Symptom two: the commit lands, but `git log --oneline` shows an invisible character before the subject (`﻿docs: …`).
- Cause two: `Out-File -Encoding utf8` in PowerShell 5.1 writes a UTF-8 **BOM**, and `git commit -F` takes those bytes as the first characters of the subject line.
- Avoid: write the message with the `Write` tool (no BOM) and pass it to `git commit -F`. Do not hand-build message files through `Out-File`/`Set-Content`, and do not rely on here-strings for anything multi-line.
- Verify: `git log --format=%s -1 | Format-Hex | Select-Object -First 1` — the first bytes must be the subject's own characters, not `EF BB BF`. Note the blemish is not worth a force push to fix on an already-pushed commit. Dated 2026-07-25 from `92e091d`, which recorded it — and the evidence is still in the history: `eae44df` and `910dc8b` carry the BOM in their own subject lines.

## A blocked event loop silently starves a spawned child's stdin

- Symptom: a `spawn`ed helper process appears to hang or never run its work, while the identical command works from a shell.
- Cause: writes to a child's stdin are flushed by the event loop. Code that blocks synchronously after spawning — `Atomics.wait`, `execFileSync` in a poll loop — never lets the write drain, so the child sits waiting on input it will never receive.
- Avoid: pass the work as an argument (`psql -c "…"`) instead of piping it, or do not block the event loop while a child is expected to consume stdin.
- Verify: `tests/advisory-lock.test.ts` holds a lock through `psql -c`; running the same SQL through `-f -` with a synchronous poll loop leaves the holder idle and every contention assertion fails. Dated 2026-07-25 from `f625ea5`, the commit that added `tests/advisory-lock.test.ts` and met this while holding a lock through a spawned `psql`.

## Plain Node can run this repo's TypeScript, but only a module that imports nothing

- Symptom: `scripts/mask-statement.mjs` dies with `ERR_MODULE_NOT_FOUND` on `@/lib/dates` after an unrelated edit to the diagnostics.
- Cause: Node 24 strips types, so it loads a `.ts` file directly — but it does not resolve the `@/` alias and does not accept an extensionless specifier. Both are bundler features the app gets from Next.js and Vitest and the harness does not.
- Avoid: keep `lib/masked-diagnostics.ts` free of imports. That is why the diagnostics live there rather than in `lib/krungthai-layout.ts`, which imports three aliased modules and therefore cannot be loaded by the harness at all. The same constraint applies to any throwaway Node script that reaches into `tests/fixtures/` — a `import type` line is erased and is fine, a value import of an aliased module is not.
- Verify: `tests/privacy.test.ts` ("keeps the masked diagnostics module dependency-free") fails the moment an import is added, before the harness does. Dated 2026-07-25 from `15bffe3`, the commit that added `lib/masked-diagnostics.ts` and the harness that loads it (D-035).

## An absolute Windows path is not a valid ESM specifier

- Symptom: a one-off Node script fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, naming a perfectly correct path.
- Cause: ESM resolves an absolute specifier as a URL, and `D:/…` parses as a `d:` scheme rather than a path. Only relative specifiers and `file://` URLs work.
- Avoid: write `file:///D:/Projects/…` in the import, or use a relative specifier. `node --experimental-strip-types` reports it the same way whether the target is `.ts` or `.mjs`, so the message does not point at type stripping.
- Verify: the scratch script that builds a synthetic PDF from the repo fixtures imports them by `file:///` URL and runs. Dated 2026-07-25 from `6c1e536`, which added `tests/fixtures/synthetic-pdf.ts` — the fixtures the scratch script imports by `file:///` URL.

## `Get-Content`/`Set-Content` mangles every em dash in a Markdown file

- Symptom: a continuity doc rewritten through PowerShell comes back with `â€"` wherever an em dash, ellipsis or arrow was. `HANDOFF.md` was corrupted this way once and had to be restored from git.
- Cause: in PowerShell 5.1 `Get-Content` defaults to the system ANSI codepage, so a UTF-8 multi-byte character is decoded as separate bytes; `Set-Content` then writes those wrong characters out as valid UTF-8. The damage is permanent and invisible to a re-read, because the file is now genuinely the mojibake.
- Avoid: never round-trip a Markdown file through PowerShell. Use the editing tools, and give `git commit -F` a message file written by the `Write` tool.
- Verify: `git diff` after such a rewrite marks every line containing punctuation as changed, not only the lines that were edited. Dated 2026-07-28 from D-052, the continuity pass that found this entry cross-referenced but never written and wrote it.

## A `.ps1` written as UTF-8 without a BOM is read as ANSI, so the script's own punctuation corrupts

- Symptom: a PowerShell script written by an editing tool fails to parse with `Unexpected token '$('` on a line that is obviously valid, and the error text shows `â€"` where the source has an em dash.
- Cause: the third member of the same family as the two entries around this one, and the one that bites when *writing* tooling rather than editing documents. `powershell.exe -File script.ps1` decodes the file with the system ANSI codepage unless it carries a BOM. A UTF-8 em dash becomes two characters, and if either lands inside a quoted string the quoting breaks and the parser fails somewhere unrelated to the real fault.
- Avoid: keep `.ps1` files ASCII-only. Where a script must emit non-ASCII — an em dash or ellipsis in generated Markdown, which this repo's continuity docs are full of — build it from a code point (`[char]0x2014`) rather than typing the character into the source. Writing the file with a BOM also works, but ASCII-only survives being moved or re-saved by anything.
- Verify: 2026-08-09. A generator for the `DECISIONS.md` index failed this way on its first run; rewritten with `$em = [char]0x2014` and no literal non-ASCII, the identical logic ran and produced the same output the mangled version was trying to write.

## Redirecting a native command's stderr in PowerShell 5.1 reports failure at exit 0

- Symptom: `pnpm lint 2>&1` prints the tool's ordinary banner as a red `NativeCommandError` with a stack trace, and the calling script treats a clean run as failed. Reading the last few lines to check a result returns the error wrapper instead of the result.
- Cause: in Windows PowerShell 5.1, redirecting a native executable's stderr wraps each line in an `ErrorRecord` and sets `$?` to `$false` even when the process exited 0. Tools that write progress to stderr — pnpm prints `$ eslint .` there — therefore look like failures.
- Avoid: do not redirect. Read `$LASTEXITCODE`, which is the process's real exit code and is unaffected. When both streams are genuinely needed, let `cmd` do the redirect (`& cmd /c "pnpm lint 2>&1"`) so PowerShell never sees the stderr, or send output to a file and read it back.
- Verify: 2026-08-09. `pnpm lint 2>&1 | Select-Object -Last 3` reported `NativeCommandError` on a run whose exit code was 0 and whose only stderr output was pnpm's own banner; the same command through `cmd /c` returned the lint result and exit 0.

## PowerShell prepends a UTF-8 BOM when piping into a native command

- Symptom: a password piped into a Node script is rejected although it is correct, and the rejection is indistinguishable from a genuinely wrong one. Found while proving an offline backup-password checker: the *correct* password failed, with the derivation completing suspiciously fast.
- Cause: `"secret" | node script.mjs` sends `EF BB BF` before the text. Verified directly — the received bytes are `239,187,191,97,98,99,13,10` for `"abc"`, so the script reads `"﻿secret"`. The same hazard as the `Get-Content`/`Set-Content` mojibake entry, in the opposite direction: PowerShell adding bytes rather than mangling them.
- Avoid: strip a leading `﻿` in any stdin password reader. `scripts/mask-statement.mjs` did not and does now — its header documents piping as supported, so a piped statement password would silently have failed against a document that would have opened. Better still, type the password rather than piping it; nothing then reaches the shell history.
- Verify: a Node harness that spawns the script and writes to its stdin directly passes where the PowerShell pipe fails — driving stdin from Node bypasses the encoding entirely and is the reliable way to test these. Dated 2026-07-25, the same day as the commit-message trap above and from the same evidence — `eae44df` and `910dc8b` still carry the BOM.

## `pnpm add` fails with `ERR_PNPM_UNEXPECTED_STORE`, and the suggested fix is the expensive one

- Symptom: any `pnpm add` refuses before resolving anything, reporting that `node_modules` was created with a different store and advising `pnpm install`.
- Cause: `node_modules` is linked from a **project-local** `.pnpm-store\v11`, while pnpm now resolves its default store to the drive root — `D:\.pnpm-store\v11`. There is no `.npmrc` in the repo or the profile and `store-dir` is set nowhere, so nothing in the tree records the choice that produced the existing links; the discrepancy is between what the tree was built with and what a fresh pnpm computes today.
- Avoid: pass `--store-dir ".pnpm-store"` on the command. It matches the existing links, adds the one package and touches nothing else. Do **not** follow the error's own advice: `pnpm install` re-links the entire tree against the new store, which is a large and unnecessary change to a working install for the sake of a single dependency — and this repo's install is deliberately offline and frozen. If the project-local store is ever meant to be permanent, record it in an `.npmrc` rather than passing the flag each time; that is a decision nobody has made.
- Verify: 2026-08-10. `pnpm store path` reports `D:\.pnpm-store\v11` while `node_modules/.modules.yaml` records `storeDir: D:\Projects\personal-finance-app\.pnpm-store\v11` — the two disagree, which is the whole trap. Adding the tesseract.js dependency with `--store-dir ".pnpm-store"` succeeded and left the rest of the tree untouched.

## PowerShell eats a scoped package name before pnpm ever runs

- Symptom: `pnpm add @scope/pkg` fails with `SplattingNotPermitted` and never reaches pnpm, so the error mentions neither pnpm nor the package.
- Cause: `@` is PowerShell's splatting operator, so `@scope/pkg` parses as a splatted variable reference rather than an argument. This is a parse-time failure in the shell — the reason the message says nothing about package management is that no package manager was started.
- Avoid: quote the name — `pnpm add '@tesseract.js-data/tha'`. Single quotes, since the name may also contain characters PowerShell would otherwise expand. The same applies to every scoped package and to any argument that begins with `@`, including `--filter @scope/app`.
- Verify: 2026-08-10, met while installing the OCR dependency. The unquoted form fails with `SplattingNotPermitted` and the quoted form installs, with no other change to the command.

## tesseract.js caches its language data into the process working directory

- Symptom: `tha.traineddata` and `eng.traineddata` appear untracked at the repository root after an OCR harness runs, each a few megabytes and neither written by any code in this repo.
- Cause: tesseract.js caches downloaded or read language data relative to the **process's** working directory, not to the module that loaded it, so a harness run from the repo root deposits them there. A harness under `.runtime/` is not protected by its own location — what matters is where the process was started.
- Avoid: run any OCR harness with its working directory inside `.runtime/`, or set the library's cache path explicitly. Then check for both files afterwards regardless: this is the same class of leak `.runtime/` exists to contain, and a stray multi-megabyte binary in the root is exactly the sort of thing that ends up in a commit. The shipped browser path is unaffected — `public/tesseract/` is populated by `prebuild` from `scripts/copy-tesseract-assets.mjs` and is gitignored (D-087).
- Verify: 2026-08-10. Both files were found at the project root after the 23-sample measurement and deleted; `git status --short` lists them as `??` while `git diff` shows nothing, which is the untracked-file trap above compounding this one. The root is clean as of this entry.

### Docker and the local Supabase projects

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

### Database, migrations and pgTAP

## `trigger_is` argument count is easy to misread

- Symptom: pgTAP reports that a human description such as “components are immutable” is the expected trigger function.
- Cause: omitting the function-name argument selects a different `trigger_is` overload.
- Avoid: pass schema, table, trigger, function schema, function name, then description.
- Verify: the three immutability assertions in `supabase/tests/001_security.sql` pass. Dated 2026-07-24 from `9203a87`, the foundation commit that added `supabase/tests/001_security.sql` and its three immutability assertions.

## JSON numbers cannot carry PostgreSQL bigint safely

- Symptom: values above JavaScript’s safe integer range are rounded before validation or hashing.
- Cause: parsing signed-int64 money or sequences as JSON numbers.
- Avoid: require canonical decimal strings at every HTTP/backup boundary and validate range before SQL casts.
- Verify: numeric `9007199254740993` is rejected and signed-int64 min/max strings round-trip. Dated 2026-07-24 from `9203a87`, which introduced `private.is_canonical_int64_text` and the canonical-string money boundary (D-002).

## SQL `NULL` can bypass ordinary inequality checks

- Symptom: a malformed manifest field reaches later restore logic instead of being rejected.
- Cause: SQL three-valued logic makes `NULL <> value` evaluate to `NULL`, not `TRUE`.
- Avoid: require object types and exact keys, add explicit null guards, and use `IS DISTINCT FROM` where appropriate.
- Verify: missing/null descriptor and mismatched-count tests fail closed. Dated 2026-07-25 from `5e4c5bb`, the commit that hardened the restore contracts with explicit null guards (D-013).

## Fingerprint-bound imports change what pgTAP fixtures may assert

- Symptom: after migration 008, a contract test that hand-writes a `fingerprint` literal fails with `fingerprint mismatch`, or an overlap fixture stops linking to the existing transaction.
- Cause: `confirm_import` now derives the fingerprint from the row's identity facts, so a literal is only accepted when it equals the derived value. Two rows can no longer be made to collide by sharing a literal, and a row can no longer differ in `description` yet claim another row's fingerprint.
- Avoid: let `pg_temp.confirm` inject derived fingerprints by default; pass `p_bind_fingerprints => false` only when the test needs a wrong or deliberately colliding claim. For overlap fixtures, make the fingerprint inputs identical and vary only `provenance`, which is not fingerprinted.
- Verify: `002` test 23 expects `fingerprint mismatch` and fails on the pre-008 schema; the overlap test still asserts `linked_existing`. Dated 2026-07-25 from `eda30bc`, the commit that added migration 008 and bound fingerprints server-side (D-014).

## Order of checks in confirm_import decides which error a fixture sees

- Symptom: a test expecting `fingerprint mismatch` gets `ambiguous duplicate fingerprints` or `payload digest mismatch` instead.
- Cause: `confirm_import` validates the digest and the distinct-fingerprint count before entering the per-row loop where the fingerprint is recomputed.
- Avoid: give a fingerprint-mismatch fixture a fresh artifact and idempotency key, a correct digest, and a single row, so nothing earlier can raise first.
- Verify: `002` test 23 passes with migration 008 applied and fails only on the expected missing exception without it. Dated 2026-07-25 from `eda30bc`, the same fingerprint-binding commit as the trap above (D-014).

## A restore can leave the audit_events identity sequence behind an existing id

- Symptom: an import that worked yesterday fails with `duplicate key value violates unique constraint "audit_events_pkey"`, naming an id that already exists, on a database nobody changed.
- Cause: `public.audit_events` is append-only, so rows accumulate, while `public.restore_backup` re-inserts audit rows with explicit ids and then sets the identity sequence to `greatest(max(id),1)`. A restore that ran while the table was empty or held only low ids leaves the sequence at or below an id a later run re-introduces, and the next audit insert collides. The failed insert consumes a value, so a retry can appear to fix itself — which is what makes this look intermittent.
- Avoid: in tests, clear the owner's audit rows and realign the sequence together — `resetOwnerImportSurface` in `tests/helpers/local-owner.ts` does both. In product code, leave the `setval` in migration 006 alone; it is correct for the table it is given.
- Verify: `select last_value from public.audit_events_id_seq` is at least `max(id)` from `public.audit_events`. When it is lower, `tests/import-confirm-e2e.test.ts` fails on its first confirmation with a 409 whose body names `audit_events_pkey`. Dated 2026-07-25 from `381cbda`, the commit that added the `audit_events_id_seq` realignment to the test wipe.

## A hard-coded literal inside a security-definer function can gate a whole feature silently

- Symptom: a new bank's import fails with `fingerprint mismatch` — a message that names tampering — after every CHECK constraint has been widened and the client is demonstrably correct.
- Cause: `confirm_import` recomputed each row fingerprint with the literal `'KTB'` while the client hashes the statement's own bank code. The constant was invisible from the outside and produced an error that pointed at the caller.
- Avoid: when widening an enumerated value, grep the RPC bodies for the old literal, not just the constraints — `grep -n "'KTB'\|krungthai-layout-v1" supabase/migrations/` finds every one. Derive such a value from the row the server already trusts (here, the bound account) rather than restating it (D-041).
- Verify: the red proof in `supabase/tests/002_security_contracts.sql` — with the constraints widened but the literal left in place, the SCB import dies with `fingerprint mismatch` rather than passing. Dated 2026-07-26 from `192798f`, the commit that added migration 009 and took the fingerprint's bank code from the bound account (D-041).

## An id remapped in every column can still survive inside jsonb

- Symptom: a restore into a project bound to a different owner passes every ownership check — no row anywhere carries the previous owner in `owner_id`, `actor_id` or `changed_by` — and that owner's uuid is still in the database.
- Cause: `overlay_revisions.snapshot` is `to_jsonb` of the whole overlay row, so it embeds `owner_id` as data. Foreign keys, RLS and column-level assertions all look past it. `restore_backup` merges `jsonb_build_object('owner_id', v_owner)` over the snapshot precisely to rebind it.
- Avoid: when checking a remap, check the jsonb payloads as text as well as the columns, and build the fixture the way the product builds the row — a hand-written snapshot that embeds no owner id cannot fail this test, which is how the first version of it passed for the wrong reason.
- Verify: `tests/recovery-portability.test.ts` asserts no `overlay_revisions.snapshot` mentions the source owner. Red proof: strip the merge from the destination's `restore_backup` and that one assertion fails while every column-level check still passes. Dated 2026-07-27 from `db87117`, the commit that added `tests/recovery-portability.test.ts` and found this (D-044).

## Per-slip mutable state cannot be a column on `public.slips`

- Symptom: the obvious design for "remember which statement row this slip matches" — a nullable column on `public.slips` — fails at run time with the trigger's own refusal, not at design time.
- Cause: migration 011 puts `slips_immutable before update or delete` on the table, calling `private.reject_change()`. Slips are append-only like every other ledger-fact table, so **no** column on them can ever be updated, whatever it holds. The same is true of `source_transactions`; the ledger's answer to mutable per-row state is the `transaction_overlays` + `overlay_revisions` pair, where the current value lives in one table and the history in an append-only other.
- Avoid: put per-slip decisions in a separate append-only table keyed by slip, where the latest revision wins, and reach for the overlay pattern rather than a column. Note the knock-on before starting: any new owner-record table is a table the backup must carry, so it bumps the backup schema version and every older version must stay restorable (`SPEC.md` gate 6, D-056).
- Verify: 2026-08-01, while designing the second half of task 22. Reading migration 011 before writing 012 is what caught it; the column design would have failed on its first update.

## A replica-mode wipe deletes parent rows without complaining about their children

- Symptom: nothing at all, for as long as it takes to matter. Later, a slip appears in a fresh run already carrying a decision nobody made, or a restore into an apparently empty ledger refuses with `restore destination ledger is not empty`.
- Cause: `resetOwnerImportSurface` and the mid-test wipes run under `session_replication_role = replica`, which is there to get past the append-only triggers — but it disables **foreign-key** triggers too. Deleting `public.slips` while `public.slip_match_overlays` still references it therefore succeeds and orphans the children, where the same delete in ordinary mode would have failed loudly and told you exactly which table you forgot. The gap arrived with migration 012 and could not surface until something wrote a decision from a test.
- Avoid: when a migration adds a table referencing an existing one, add its delete to every wipe **above** the parent's, in child-first order, in the same change as the migration. Do not rely on the delete failing to remind you — under replica mode it cannot. `restore_backup`'s emptiness check is the other half of the cost: it counts every owner-record table, including ones a wipe forgot.
- Verify: 2026-08-07. `tests/helpers/local-owner.ts` now deletes `slip_match_revisions` then `slip_match_overlays` then `slips`; `tests/slip-match-route.test.ts` writes decisions and leaves none behind, and the owner browser suite passes 19/19 with the restore specs running after it in the same file.
- **Met again on 2026-08-10**, exactly as predicted, for migration 013's five tables — the two correction overlays, their two revision tables, and `cash_entries`. The wipe now deletes all five, corrections above `slips` and cash in its own child-first group. Note the second half of the cost that 012 did not have: **a cash entry hangs off no account**, so `assertOnlyDisposableLedgerData` cannot see one — its whole signal is an unrecognised row in `public.accounts` — and a leftover cash entry would simply be counted into the next run's ledger totals as money that moved.

## `create_cash_entry` bounds no date, while `capture_slip` bounds one

- Symptom: a cash entry dated 2569 is accepted by the database without complaint, and appears in the ledger 543 years out. The equivalent slip is refused server-side with `outside the plausible window`.
- Cause: `capture_slip` (migration 011) checks the date against a plausibility window precisely because Thai receipts print Buddhist-era years; `create_cash_entry` (migration 013) checks only that the date is **not null**. The asymmetry is easy to miss because the two RPCs are otherwise near-twins, and easy to assume away because the form does bound it — `CASH_MAX_AGE_YEARS` in `lib/cash.ts` sets `min`/`max` on the date input and the API route trusts what zod parsed.
- Avoid: treat `app/cash-entry.tsx` as the **only** guard there is, and do not add a second caller of `POST /api/v1/cash` that skips it. Closing it properly means a new migration — 013 is applied and published, and this repository does not edit an applied artifact (D-084, and the same reason 014 exists rather than 013 being amended).
- Verify: 2026-08-10, by reading both RPCs side by side while writing the cash form. Not covered by any test: the suites go through the form or through a zod-validated route, so neither reaches the unbounded path.

## `supabase db query --linked` can answer from the local database, and the CLI names neither

- Symptom: a query meant for the hosted project returns correct-looking numbers that are actually the local project's. The output carries no indication of which database answered.
- Cause: the CLI falls back to the local database when the SQL spans multiple lines, and `--linked` after the SQL argument is not always honoured. Worse, the tell is gone: an earlier version printed `Connecting to remote database...` on the working path, and **v2.109.1 prints `Initialising login role...` and names neither remote nor local**. So the one-word check that used to distinguish them no longer exists.
- Avoid: pass the SQL as a **single line** with `--linked` **before** it, and then prove the destination rather than trusting the invocation. Three independent proofs, all cheap: `inet_server_addr()` returns a public address rather than a loopback or Docker one; the row counts match what the intended ledger holds; and `docker ps` says whether any local project could have answered at all — a stopped daemon rules them out entirely.
- Verify: 2026-08-12. All three were used to establish that the hosted backup verification read the hosted database, and the daemon happened to be down at the time, which is the strongest of the three. The missing tell was found by looking for it and reading a different first line.

## A new table is NOT born with zero privileges, and grepping the migrations cannot tell you what it holds

- Symptom: a table added by a recent migration silently carries `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` for **`anon`** and `authenticated`, while every migration in the repository appears to grant it nothing but `select`. Thirteen tables are in that state today — every `slips`, `cash_entry` and `notification_card` table, i.e. everything added after migration 002. `TRUNCATE` **bypasses RLS entirely**, so the row-level policies say nothing about it.
- Cause: two things compose, and neither is visible in this repository's SQL. Supabase's own bootstrap runs `alter default privileges in schema public grant ... to anon, authenticated, service_role`, which hands every **future** table created by `postgres` the `Dxtm` set. Migration 002 then runs `revoke all on all tables in schema public from anon, authenticated` — but that form expands **at execution time** over the tables then existing, so it cleaned up 001–002's tables and reaches nothing created afterwards. **No migration since has repeated it.** The later migrations revoke only `insert, update, delete`, which the default never granted, so those revokes are no-ops against the real default and the protection they look like they provide comes from those privileges simply never being granted.
- **Fixed by migration 018 as of 2026-08-15** (D-107), and the entry stays because the trap is about how to *reason*, not about the state it found. 018 revokes the inherited set from every existing table and sequence, re-grants `select` to `authenticated`, and — the part that matters here — runs `alter default privileges in schema public revoke all on tables / on sequences from anon, authenticated`, so a table added by migration 019 no longer inherits anything. The steady state is now one row: `authenticated | SELECT | 28`.
- Avoid: when adding a table, do not reason from the migration text. The defaults are handled now, so a new table starts with nothing — but confirm that from the catalog rather than from this sentence. Do not write `revoke insert, update, delete` and believe it did something; it did not before 018 and it does not after.
- Verify: **query the database, never the repository.** `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')`, and `select defaclrole::regrole, defaclnamespace::regnamespace, defaclacl from pg_default_acl` for the defaults that produced it. Confirmed 2026-08-15 by actually doing it: `set local role anon; truncate public.notification_card_decision_revisions;` **succeeded**, inside a transaction that was then rolled back.
- **The meta-lesson, which cost a wrong entry in this very file.** The security review of migration 017 (D-105) grepped the migrations for `alter default privileges`, found none, and concluded that a new table starts with no privileges. That is a conclusion about the **database** drawn from a search of the **repository**, and it was wrong — the platform sets defaults the repository never mentions. D-106 records the correction. A grant question is a database question and only a database can answer it.

## A version or count written into `SPEC.md` is a claim no gate re-reads

- Symptom: every check is green and an invariant in `SPEC.md` contradicts the database. It has happened twice. On 2026-08-12 the strong-access rule said two verified TOTP factors where migration 015 had made it one, and it was wrong for a day. On 2026-08-15 gate 6 declared the backup contract as reading v2 … v6 and writing v6, which migration 017 had falsified when it landed.
- Cause: `check:docs --strict` reads **structure** — that files exist, that links resolve, that sections are present. It does not read meaning, and no automated check compares a number written in prose against the source that owns it. So a version, a count or a threshold in `SPEC.md` decays silently and the failure is invisible to the gate by construction.
- Avoid: when a migration moves a number that `SPEC.md` states, edit `SPEC.md` in the same commit as the migration. When reading `SPEC.md` later, treat every number in it as a claim to check rather than a fact to use — the owning source is `lib/backup-contract.ts` for backup versions, `lib/owner-access.ts` and `private.has_strong_owner_access` for the factor count. This is the same failure as a test title naming a destination that moves (`955253c`), and the same remedy: name the thing that does not move, or assert against the constant.
- Verify: 2026-08-15. Both instances were found by a human-style read — the first by a continuity sync, the second by a security review — and neither by any command. That is the point of the entry: there is no command to add.

### Backup, restore and recovery

## Snapshot generation is not backup custody

- Symptom: the UI reports a current backup even though encryption or download failed.
- Cause: freshness was marked before the client possessed the encrypted artifact.
- Avoid: snapshot first, encrypt and hand off the artifact, then acknowledge its digest and sequence. Reject acknowledgement if the ledger sequence changed.
- Verify: failure before acknowledgement leaves backup status stale. Dated 2026-07-24 from `9203a87`, the foundation commit that introduced `last_exported_sequence` and the acknowledge-after-handoff flow.

## Restore sequence semantics must be exact

- Symptom: zero, duplicate, or mismatched mutation-sequence rows are accepted.
- Cause: treating the last available row as authoritative.
- Avoid: require exactly one sequence row equal to the manifest snapshot sequence; apply one post-restore increment and mark stale.
- Verify: manifest/data sequence mismatch and duplicate-row tests are rejected. Dated 2026-07-25 from `5e4c5bb`, the commit that added migration 006's sequence bounds (D-013).

## `.pldemo` is intentionally non-restorable

- Symptom: a user assumes the synthetic UI download can recover the ledger.
- Cause: confusing an encryption demonstration with the schema-v2 backup contract.
- Avoid: preserve its `.pldemo` extension and preview labeling; never clear backup staleness from this path.
- Verify: 2026-08-10. `.pldemo` is still produced by live code — `lib/download.ts`, `app/recovery-bench.tsx`, `app/import-bench.tsx` and the owner spec all reference it — so the mistake it warns about is still reachable from the running app. It reads like a design note, but the symptom is a person mistaking a demo file for their backup, which is a trap and belongs here.

## Schema version 1 has no upgrade promise

- Symptom: old pre-release backup files fail schema-v2 restore.
- Cause: v1 existed before real-data authorization and was retired rather than migrated.
- Avoid: do not advertise v1 compatibility. Schema v2 is the first supported recovery contract.
- Verify: 2026-08-10, checked against the database rather than the docs. `restore_backup` refuses anything outside `('2','3','4','5')`, so no v1 file can be staged. Note the one place that still says otherwise: `restore_runs_schema_version_check` reads `schema_version = ANY (ARRAY[1,2,3,4,5])`, carried forward unchanged since the foundation migration. Harmless — `restore_backup` is the only writer and it refuses first — but the table and the function disagree on paper, so read the function, not the constraint, when asking which versions are supported.

## `restore_request` strips nulls inside the chunk, breaking digest binding

- Symptom: a hand-authored populated restore fixture fails with `restore chunk binding mismatch` even though the manifest and chunk look correct.
- Cause: the `pg_temp.restore_request` test helper wraps the whole request in `jsonb_strip_nulls`, which recurses into the chunk and drops any row field whose value is `null` (for example `source_transactions.branch`). The chunk sent to `restore_backup` then differs from the one `finalize_restore_fixture` hashed, so `sha256_jsonb(chunk)` no longer matches the descriptor digest.
- Avoid: give every nullable column a non-null value in populated restore fixtures, or build the request without `jsonb_strip_nulls`. Do not assume export→fixture round-trips are null-safe.
- Verify: the populated round-trip in `supabase/tests/003_restore_contracts.sql` stages all 11 chunks and its re-export equality assertion passes. Dated 2026-07-25 from `5e4c5bb`, which added the populated round-trip in `supabase/tests/003_restore_contracts.sql` that met this (D-013).

## Restore counts must be canonical integers, not merely JSON numbers

- Symptom: a fractional manifest count (e.g. `1.5`) fails with an uncaught `22P02: invalid input syntax for type integer` instead of a controlled contract error.
- Cause: validating counts only as `jsonb_typeof = 'number'` lets non-integers through to a `text::integer` cast.
- Avoid: require canonical non-negative integer text (`^(0|[1-9][0-9]*)$`) for `tableCounts[kind]` and each descriptor `rowCount` before any cast.
- Verify: the `003` fractional-count test expects `invalid restore manifest descriptor` and fails on the pre-006 schema. Dated 2026-07-25 from `5e4c5bb`, the commit that added migration 006 (D-013).

## A wiped ledger and a wiped session look the same from a failing restore

- Symptom: a browser test that empties the ledger and then restores it fails with `strong owner access required`, though the page is still signed in and the JWT still claims `aal2`.
- Cause: reaching for `resetOwnerImportSurface` to empty the ledger. It also deletes the owner's `auth.mfa_factors`, and `private.has_strong_owner_access` counts verified factors in the database rather than trusting the token — so the session the restore needs is gone with the rows.
- Avoid: for a mid-test wipe, delete the ledger tables directly under `session_replication_role = replica` and leave `auth` alone. Keep `resetOwnerImportSurface` for setup and teardown, where dropping the factors is harmless.
- Verify: `tests/e2e/owner-session.spec.ts` "backs up a confirmed ledger and restores it after the ledger is destroyed" restores under the same session that took the backup. Dated 2026-07-27 from `b4df30c`, the commit that added the destroy-and-restore browser spec this was found in (D-046).

## A cleanup helper that predates a migration makes the next restore fail, at commit, naming no table

- Symptom: a restore stages cleanly, every chunk is accepted, and then `commit` refuses because the destination is not empty — with nothing to say which table is not empty. The suite that ran before it passed.
- Cause: `restore_backup` checks emptiness across the tables the **destination's own migration** knows about, which grows with every schema version. A test helper that empties the destination by naming tables is a hard-coded list frozen at the day it was written; `tests/recovery-portability.test.ts`'s cleared only the original eleven while the destination had since gained `slips`, the two match-decision tables and migration 013's five. A row left in any of them is invisible to the helper and fatal to the next restore.
- Avoid: derive the cleanup from `BACKUP_TABLE_KINDS` rather than from a literal list, so a new backup table is cleared by the same change that adds it — the same "build it from the contract, not from memory" rule `lib/restore-plan.ts` follows for the kind list. Keep `mutation_sequences` out of it: that row is a per-owner singleton the destination must retain.
- Note where the cost lands, which is what makes this worth an entry: the failure surfaces at the **end** of the sequence, so every chunk has to be re-sent to reach it, and the message is about emptiness rather than about the table — so the natural suspicion is the restore contract rather than the fixture that ran before it.
- Verify: 2026-08-10. Adding a second restore test to that file surfaced it immediately; deriving the delete list from `BACKUP_TABLE_KINDS` fixed it and left the original test passing unchanged (D-089).

## A wrong backup password and a corrupted backup file report identically

- Symptom: Recovery / 04 reports "The backup could not be decrypted. Check the password; if it is right, the file has been altered", and there is no way to tell from the app which of the two it is.
- Cause: AES-256-GCM authenticates ciphertext and key together, so a wrong PBKDF2 key and a tampered ciphertext both surface as one auth-tag failure. The hedged wording is honest rather than evasive.
- Avoid: diagnose the envelope separately before suspecting the file. `lib/backup.ts` wraps the ciphertext in plain JSON — header, base64 salt and nonce — and corruption from a move, a sync client or a re-encode breaks *that* long before it reaches the cipher. If the JSON parses, the header matches exactly, the salt is 16 bytes and the nonce is 12, the file is intact and the password is the remaining explanation. This reads no plaintext and needs no password.
- Verify: done on the real 2026-07-28 backup after a failed restore — 14,784 bytes, envelope structurally perfect, so the file was exonerated without anyone typing a password. Moving a file between volumes copies its bytes; it cannot change them.

## A recovery destination can start non-empty, which makes portable recovery fail rather than skip

- Symptom: `node scripts/recovery-destination.mjs up` reports `This project is NOT empty — a restore into it will be refused`, and `tests/recovery-portability.test.ts` then fails rather than skipping. This is a **third** reading of that gate row, and the one nobody expects: the two documented outcomes are "ran" and "skipped", and both of those are readings of a destination that is either up or down.
- Cause: `up` starts and migrates the project; it does not discard what an earlier run left in it. `restore_backup` refuses a destination holding any owner record, so leftovers from a previous run make every restore fail at commit — after every chunk has been accepted, with a message about emptiness that names no table.
- Avoid: `down` then `up`, always, before a run that matters. `up` alone is only safe on a destination nothing has ever restored into.
- Verify: 2026-08-12, twice. First met with 4 ledger accounts left behind, where `down` then `up` gave a clean destination on migration 015; met again the same day taking the destination to 016, where `down` then `up` was run pre-emptively and reported `Ledger accounts: 0`.

### Statement and slip parsing

## Deposit plus withdrawal is not sufficient anomaly evidence

- Symptom: an arbitrary balance mismatch is silently accepted and used to reset the running balance.
- Cause: classification based only on the component pair.
- Avoid: require `provenance.parserFields.anomaly = "interest-tax-order"` at both TypeScript and SQL boundaries.
- Verify: the unmarked compound-row tests remain blocking. Dated 2026-07-24 from `9203a87`, the commit that introduced the `interest-tax-order` marker at both boundaries (D-007).

## pdf.js needs its worker handed over explicitly, and pointing at the package path backfires

- Symptom: every PDF fails identically with `PDF_PARSE_FAILED / Error` — a bare `Error`, not one of pdf.js's named exceptions — no matter what the file contains. Setting `GlobalWorkerOptions.workerSrc` to `pdfjs-dist/build/pdf.worker.mjs` then changes the symptom to a status line of `undefined (undefined)`.
- Cause: with `GlobalWorkerOptions` unconfigured, pdf.js falls back to loading its worker module inline and throws before reading any page. Setting `workerSrc` to a package path does not help under Turbopack: the module is bundled into the parser worker's own chunk, executes in that global scope, replaces `self.onmessage`, and posts pdf.js's internal protocol messages straight to the main thread — so the UI renders pdf.js's message shape instead of the parser's.
- Avoid: give pdf.js a real `Worker` through `GlobalWorkerOptions.workerPort`, built from a dedicated entry module (`workers/pdf.worker.entry.ts`) with `new URL("./pdf.worker.entry.ts", import.meta.url)`. That is the same relative-URL form the app already uses for the parser worker, and it emits a separate chunk, so the two never share a scope or a channel.
- Verify: `tests/e2e/parser.spec.ts` parses a generated PDF in a real browser. Both of its tests fail with `PDF_PARSE_FAILED / Error` on the pre-fix worker, which is the red proof; no unit test can catch this, because none of them run pdf.js. Dated 2026-07-25 from `6c1e536`, which added `tests/e2e/parser.spec.ts` together with the `workerPort` fix (D-023).

## A frame label that equals a column heading moves the grid header

- Symptom: one frame field reports `MISSING_FRAME_FIELD … (label not found)` while other frame fields on lines printed *higher up the page* read correctly. The column anchors all matched, so the failure looks like a wording problem in the one field.
- Cause: `extractStatement` resolves `headerY` from the first line containing *any* column anchor, while `findColumns` requires all seven on one line. A real statement prints `Branch` as a frame label above the grid, which matches the `branch` column anchor, so `headerY` lands on that frame line. `extractFrame` then filters `frameLines` to `y > headerY + LINE_TOLERANCE` and silently drops every frame line below it — the fields printed above the stray match survive, which is what makes it read as a per-field problem.
- Avoid: take `headerY` from the line `findColumns` actually matched — it returns its `y` alongside the columns — rather than from the first anchor hit anywhere. Do not special-case the colliding word; any frame label equal to a column heading (`Branch`, `Balance`, `Transaction` …) reproduces this. Fixed 2026-07-25, D-028.
- Verify: the fixtures print a `Branch` frame label between `Account Type` and `Account Number`, and `tests/krungthai-layout.test.ts` ("finds the grid header even when a frame label matches a column heading") asserts that printed order as well as the resulting suffix — the order is what makes the failure partial and therefore misleading. Restoring the any-anchor search fails 26 of the 32 layout tests with the real statement's exact message.
- Related trap: a fixture whose frame is a flat list of labels cannot reproduce this at all. Adding a frame label to `FRAME_LABEL_STOPS` without also printing it in the fixture leaves the same class of bug undetectable.

## The summary block sits inside the row region, so it can be eaten by the last transaction

- Symptom: the final row of a statement carries extra text in its cells, or fails with an unreadable date/time cell whose shape has trailing words and digits — but only on statements whose last page ends tightly.
- Cause: `Total Page` / `Total Withdrawal` / `Total Deposit` are printed below the grid heading, which is exactly the region the row scanner walks. They carry no date, so they fall through to the continuation branch, and a block printed within `DETAIL_TOLERANCE` of the last row is merged into it.
- Avoid: match `SUMMARY_LABELS` in the row loop and end the current row there. Distance alone is not a guard — it works on the one statement measured (33 units of clearance) and silently does not on a tighter one.
- Verify: `tests/krungthai-layout.test.ts` ("never absorbs a summary line into the last row, even printed close to it") shifts the block to within `DETAIL_TOLERANCE` and still expects one clean row. Dated 2026-07-25 from `cfa24d8`, the commit that introduced `SUMMARY_LABELS` with the printed-totals cross-check (D-033).

## A right-aligned number's left edge is not inside its own column

- Symptom: a statement reads correctly for hundreds of rows, then one row fails with two amounts joined in one money cell and the next cell empty — `deposit[ddd.dd dd,ddd.dd] balance[]`. The trigger is a *magnitude*, not a row type: it appears the first time a figure gets wide enough.
- Cause: money and branch columns are right-aligned while text columns are left-aligned, so a wider figure starts further left. Banding by left edge therefore drifts one column left as magnitudes grow. Measured on a real statement: the balance column is right-aligned to ~518 with a digit width of 4, so `d,ddd.dd` starts at 491 but `dd,ddd.dd` starts at 487 — under the 489 boundary. The margin was 2 units, and a 7-digit branch code sat exactly on its boundary with none.
- Avoid: band by the run's **midpoint**, using the `width` pdf.js reports (`centreOf` in `lib/krungthai-layout.ts`). A midpoint moves half a glyph per extra character where a left edge moves a whole one. Do not widen the left-edge tolerance instead — that only moves the magnitude at which it breaks.
- Verify: `tests/krungthai-layout.test.ts` ("assigns a right-aligned amount by its midpoint") starts a `dd,ddd.dd` balance left of its anchor with its midpoint inside. Restoring the left-edge rule fails it with the real statement's exact shape. Note the worker must keep forwarding `item.width`; drop it and fixtures still pass on their estimate while real statements regress. Dated 2026-07-25 from `bbc2a1f`, the commit that introduced `centreOf` (D-030).

## A two-digit year on a Thai statement belongs to either calendar, and guessing wrong is silent

- Symptom: the statement parses, every row reads, nothing fails closed — and the dates are 43 years off. A period shows as `1983-07-01` when the file says July 2026.
- Cause: `2500 + 26 - 543 = 1983`. A Thai-language statement dates 2026 as `69` (Buddhist 2569); an English-language one dates it `26`. Assuming either calendar unconditionally shifts every date in the file by 543 years, and because rows anchor on the period-end year, the whole import shifts together and stays internally consistent — so reconciliation, balances and fingerprints all still agree.
- Avoid: determine the era once from the period end via `resolveStatementEra`, then apply it to every date. The two readings are always exactly 543 years apart, so a plausibility window narrower than that admits at most one — that makes it arithmetic rather than a heuristic. Fail closed when neither reading is plausible; never fall back to a default calendar.
- Verify: `tests/domain.test.ts` walks all 100 two-digit years and asserts the ambiguous branch is unreachable (Gregorian admits 06–27, Buddhist 49–70, disjoint). `tests/krungthai-layout.test.ts` reads a Gregorian statement as 2026 and a Buddhist one as 2026. **This class cannot be caught by a fail-closed check** — only by asserting a resolved date against an independently known one, which is why the bind screen prints the period. Dated 2026-07-25 from `bbc2a1f`, the commit that introduced `resolveStatementEra` (D-031).

## A frame label's value runs into the next field on the same line

- Symptom: the account's last four digits are wrong but plausible — no error, no failed check, just the wrong account bound to an import.
- Cause: frame lines carry several label/value pairs (`Account Number … 1234567890 … Branch Code … 555`). Reading everything to the right of a label concatenates the following field's digits, and `digits.slice(-4)` then takes them from the wrong field.
- Avoid: stop a label's value at the next item matching any known frame label — `FRAME_LABEL_STOPS` in `lib/krungthai-layout.ts`, which lists the fields that are printed but not read as well as the ones that are. Add new frame labels there, not only to `FRAME_LABELS`.
- Verify: `tests/krungthai-layout.test.ts` prints `Branch Code 555` on the account-number line and asserts the suffix is `7890`, never `5555`. Dated 2026-07-25 from `0da3b15`, the commit that introduced `FRAME_LABEL_STOPS` (D-026).

## An anchored label pattern rejects padded whitespace you cannot see

- Symptom: one frame field reports as missing while its neighbours on the same printed line read correctly, and every diagnostic shows the label spelled exactly as the pattern expects.
- Cause: `^…$` against the raw run, where the label is printed with padded or non-standard internal spacing (`Account  Number`). NFKC folds a non-breaking space to a normal one but does not collapse runs of them, and neither a rendered page nor a copied diagnostic shows the difference.
- Avoid: collapse internal whitespace before matching a label (`str.replace(/\s+/gu, " ").trim()`), and do not abandon the search when a label occurrence carries no value — the same wording can appear as a bare heading above the pair that actually holds the value.
- Verify: `tests/krungthai-layout.test.ts` rewrites the label to `Account  Number` and still expects a successful read. Dated 2026-07-25 from `0da3b15`, the same frame-contract commit as the trap above (D-026).

## A dense digit-free line is a transaction row as often as it is a heading

- Symptom: a masked dump's label section lists real merchant or counterparty names beside the column headings.
- Cause: judging "this is a heading" by density. A real SCB statement prints every transaction as `<code> | DESC : | <merchant>` — three short digit-free items, which is exactly the shape a heading row has. Judging by position instead does not fix it: rows sit on a fixed pitch, so the same `y` recurs on every page and a frequent counterparty lands in the same slot twice.
- Avoid: drop the whole line if any item on it carries a digit. A transaction row always has a date or an amount; a heading row never does. Keep the same-position-across-pages rule as a second filter, not the first (D-038).
- Verify: `tests/privacy.test.ts` "never reports a transaction row, however heading-shaped it looks" — and note its fixture includes the date and amounts, because an earlier version omitted them and passed against a rule that did not hold. Dated 2026-07-26 from `ff54d4d`, the commit that made the masker's rule structural rather than density-based (D-038).

## A bank's name appears on other banks' statements

- Symptom: every KBANK statement is routed to the SCB reader and fails on a column anchor, or an SCB statement is routed to the Krungthai reader.
- Cause: identifying a layout by the bank's name on page one. Both real KBANK statements print `Internet/Mobile SCB` as an ordinary channel on transfer rows, because that is what a transfer is. Worse, a masked dump masks every letter, so the name a statement actually prints is not knowable from one — the signature would be a guess that the only available evidence cannot check.
- Avoid: identify a layout by its **heading anchor set** appearing in full on one line. It is unique per bank, present on every page, and a transaction description cannot forge it (D-039). Krungthai keeps its name signature because it is proven against a real statement, and is tried only after the heading sets fail.
- Verify: `tests/statement-layout.test.ts` "keeps a KBANK statement whose rows name another bank on the KBANK reader" and "keeps an SCB statement whose rows name Krungthai on the SCB reader". Dated 2026-07-26 from `192798f`, the commit that added `lib/statement-layout.ts` and its heading-anchor signatures (D-039).

## Heading x positions do not bound the data columns, except on the layout you wrote them for

- Symptom: a reader ported from one bank to another misfiles most of a row — short descriptions land in the time column, descriptions land under the balance heading — while the heading anchors all match.
- Cause: assuming a column's heading sits above its data. On Krungthai it does, which is why midpoint banding works there. On SCB the description runs print far left of `Description/Note`, under `Balance/Baht`; on KBANK short descriptions print left of `Descriptions`, inside the time column's band. Nothing requires a bank to align the two.
- Avoid: for a new layout, read the row as an ordered **grammar** — the runs before the money, the money, the runs after — and identify each field by its kind and position in that sequence. Use geometry only where it carries information nothing else does (D-039). Do not generalize a working reader onto a second layout before seeing the second layout's dump.
- Verify: `tests/statement-layout.test.ts` "maps the channel, code and DESC text to distinct row fields" and its KBANK counterpart. Dated 2026-07-26 from `192798f`, the same commit that added the second and third readers (D-039).

## A fixture that supplies its own run widths cannot test right-edge geometry

- Symptom: the unit suite is green on a layout whose money columns are separated by right edge, and the browser reads the same statement with both columns merged — or with a smear that grows with the length of each figure.
- Cause: `TextItem.width` is optional, so a hand-written fixture asserts the width instead of measuring it. pdf.js reports the *rendered* width. If the fixture assumes a different per-character advance than the PDF generator emits, every right edge lands somewhere else, off by the difference times the character count — so short figures look fine and long ones do not.
- Avoid: take the fixture's glyph advance from the generator (`SYNTHETIC_GLYPH_ADVANCE` in `tests/fixtures/synthetic-pdf.ts`) rather than choosing one, and put the layout through a real PDF in the browser suite. This is the same gap as D-027: a green unit suite that never ran pdf.js.
- Verify: `tests/e2e/statement-pdf.spec.ts` reads generated SCB and KBANK PDFs through the real worker; the KBANK fixture places its two money columns twice `COLUMN_EDGE_TOLERANCE` apart and no more, so any drift merges them and the read fails closed. Dated 2026-07-26 from `192798f`, which added both `SYNTHETIC_GLYPH_ADVANCE` and `tests/e2e/statement-pdf.spec.ts`.

## A layout has one row date separator, not one date separator

- Symptom: every statement of a layout reports a missing statement period, while its rows parse.
- Cause: threading the row separator through to the frame. KBANK prints its rows as `dd-dd-dd` and its period as `dd/dd/dddd - dd/dd/dddd`, on the same document.
- Avoid: match the frame's period on either separator, requiring both of its dates to use the same one, and keep the row separator to rows.
- Verify: the KBANK fixtures print hyphen rows and a slash period, and `tests/statement-layout.test.ts` reads both. Dated 2026-07-26 from `192798f`, the commit that added the KBANK fixtures printing hyphen rows and a slash period.

## A Thai slip QR does not always decode at native screenshot resolution

- Symptom: `cv2.QRCodeDetector().detectAndDecode()` returns an empty string for some slips while others from the same bank decode from the same folder. It looks like those slips carry no QR.
- Cause: the QR occupies only 0.17–0.26 of image width on a screenshot 1,000–1,300 px wide, which puts the module size near the decoder's limit once JPEG compression has been applied. `detect()` still finds the finder pattern, so "no QR present" and "QR present but unreadable" are different failures that look identical to a caller checking only the payload.
- Avoid: on an empty payload, retry at 2x cubic upscale before concluding anything. Three of the 23 sample slips need it and all three then decode (D-053). Distinguish the two cases with `detect()` rather than inferring absence.
- Verify: `detect()` returning `True` while `detectAndDecode()` returns `""` is the signature of the recoverable case; the same image at `fx=2, fy=2` returns a 64-character payload. Dated 2026-07-28 from D-053, the measurement of all 23 real samples that found the three needing a 2x upscale.

## A cross-checked statement can still fail the balance chain

- Symptom: a statement reads cleanly, reports `crossChecked` true, and is then refused at `assembleImportPayload` with `BALANCE_RECONCILIATION_FAILED` — "Unexplained balance gaps block confirmation."
- Cause: the two checks are independent and answer different questions. D-033's cross-check compares the reader's per-direction counts and totals against the summary block the statement prints, which a dropped *component* need not disturb if the row still exists and the totals still sum. `reconcileRows` walks row by row asserting `previous + movement == printed balance`, which a dropped component breaks immediately. A statement can satisfy the aggregate and fail the sequence.
- Avoid: read `crossChecked` as "the bank's own totals agree", not as "this statement will import". Check blockers separately before assuming a document is importable — `reconcileRows(frame.openingBalance, rows).blockers` answers it without writing anything.
- Verify: `KRUNGTHAI-01` on 2026-07-29 — cross-checked true, 3 blockers among 233 rows, all on page 10 (D-054). Every other statement in that batch had zero blockers, so this is a property of one document rather than of the check.

## A payload that carries the repaired data reconciles clean, so the surface that should report the repair reports nothing

- Symptom: every test passes, the function under test demonstrably emits a warning, and the screen shows none. The owner asks "where do I see the warning?" and the answer is nowhere.
- Cause: `assembleImportPayload` submits rows in applied order (D-055), and on a successful bind `app/import-bench.tsx` replaces the parsed statement with that payload. The review table then re-reconciles a payload whose rows already chain, so it correctly finds nothing to report. The repair had happened; the evidence of it had been consumed by the repair itself.
- Avoid: when a function both fixes something and reports it, the report has to travel with the fixed artifact rather than be re-derived from it. `AssemblyResult` now carries `warnings` alongside `payload` for exactly this reason. More generally: if a claim is "X is surfaced to the owner", the test has to assert it at the surface — `tests/import-assembly.test.ts` asserts assembly hands the warning back, because a `lib/reconcile.ts` test asserting the warning exists passed throughout while the screen stayed blank.
- Related trap in the same shape: the warning cited printed row numbers (206–209) that no screen displays, so even once rendered it could not be checked against the table. It now names the date and points at the balance column, which is what the owner can actually read.
- Verify: 2026-07-29. Reproduced by loading `KRUNGTHAI-01` and searching the review page for "reordered" — 0 matches before the fix, 2 after (banner and badge), with the badged row being the interest posting printed first on its date and applied last.

## A WebAssembly decoder resolves its binary next to the bundled chunk, so it 404s and fails silently

- Symptom: a decoder that works perfectly in a scratch harness returns nothing at all inside the app. No exception, no console error the page surfaces, no CSP violation — the capture form simply never appears, as though the image contained no QR.
- Cause: `zxing-wasm` locates `zxing_reader.wasm` relative to its own module URL. Bundled by Next.js that URL is `/_next/static/chunks/…`, where no such file exists. The fetch 404s inside the module's initialisation and the failure surfaces as an empty result rather than a throw, which reads exactly like "this image has no barcode".
- Avoid: serve the binary from your own origin and say so explicitly — `prepareZXingModule({ overrides: { locateFile: … } })` pointing at a copy in `public/`, put there at build time by `scripts/copy-zxing-wasm.mjs` (`prebuild`). Do not reach for a CDN; `default-src 'self'` is deliberate. Do not commit the binary either — copying from `node_modules` keeps it pinned to the installed version.
- The generalisation worth keeping: when a WASM-backed library "works in a test script and not in the app", suspect asset resolution before suspecting the CSP. The bundler moved the module; the asset did not move with it.
- Verify: 2026-07-30. Five owner-session specs failed with the form never rendering, and passed once `locateFile` pointed at `/zxing_reader.wasm`. `public/zxing_reader.wasm` is gitignored and present after any `pnpm build`.

## A WASM core path naming a directory makes the engine ask for a file the build never copied

- Symptom: the OCR amount finder reports that it could not start, and the network log shows a 404 for `tesseract-core-simd-lstm.wasm.js` — a file name that appears nowhere in this repository. The CSP is the obvious suspect and is not involved.
- Cause: given a **directory**, tesseract.js feature-detects SIMD and composes its own file name, landing on `tesseract-core-simd-lstm.wasm.js`. That is the ~3.9 MB single-file variant with the WebAssembly inlined. `scripts/copy-tesseract-assets.mjs` copies the other packaging — the 89 KB `tesseract-core-simd-lstm.js` loader plus its separate 2.9 MB `.wasm` — so the composed name has nothing behind it. Both variants exist in `tesseract.js-core`, differ by one `.wasm` infix, and only one is served.
- Avoid: give `corePath` the **exact file**, not the directory. A path ending in `js` is taken verbatim and skips detection entirely, which is what makes the build's copy list and the runtime's request the same decision instead of two that must be kept in agreement. The same rule is why `langPath` is a directory and safe: there the file name is composed from the language code and `gzip`, both of which the build also controls.
- The generalisation, and it is the same one the ZXing entry above reaches by a different route: a library that composes an asset name at runtime has a second, invisible copy of your build's file list. Name the file, or make a test compare the two lists.
- Verify: 2026-08-10. `tests/privacy.test.ts` ("asks the build for exactly the assets the engine loads") compares every `/tesseract/<file>` the engine names against the copy script's `to:` list; pointing `corePath` at the directory-resolved name fails exactly that assertion and nothing else. The owner browser spec then asserts all four files are actually requested from the app's own origin, which is the half a string comparison cannot reach.

### Real data, masking and privacy

## Never use real statements to develop the parser

- Symptom: private PDF bytes, passwords, or values appear in logs, fixtures, screenshots, a session transcript, or commits.
- Cause: using `private-statements/` as convenient parser input.
- Avoid: use approved synthetic geometry fixtures only. Since 2026-07-25 there is exactly one sanctioned route to a real document — **invoke `scripts/mask-statement.mjs`, never read the PDF** — and it emits only masked structure to the gitignored `masked-dumps/` (D-035, `docs/FIXTURE_POLICY.md`). A dump is working material, never a fixture: do not transcribe its coordinates or wordings into one, and never commit it. A real-PDF browser smoke test still requires renewed explicit authorization.
- Verify: privacy tests pass, `git status` never shows a dump, and repository searches contain no real values or statement passwords.

## Mis-decoded text hides in the character classes a masker leaves alone

- Symptom: a masked dump contains runs like `⤎x xxd⁄d⏟` or `$d=%$d. d+$, dd%/,&&d/d'` instead of `x` and `d`.
- Cause: a PDF that embeds subset fonts with no usable `ToUnicode` map makes pdf.js resolve glyphs to arbitrary code points, often symbols. A masker that replaces letters and digits and *keeps everything else* passes those through verbatim — a deterministic remapping of real content, undoable by anyone with the font's cmap.
- Avoid: mask by allowlist. Keep only the punctuation that genuinely carries format (`. , / - :` and friends) and replace everything else with `?` (D-038).
- Verify: `tests/privacy.test.ts` "masks a character that decoded to a symbol rather than letting it through", which also asserts the format shapes still read as `dd/dd/dd dd:dd` and `d,ddd.dd`. Dated 2026-07-26 from `ff54d4d`, the commit that made the masker an allowlist (D-038).

## A folder of statements may contain something that is not a statement

- Symptom: a layout looks catastrophically unreadable — amounts decoding to punctuation — and the obvious conclusion is that the bank's format cannot be parsed.
- Cause: the file was not a statement. A KBANK export folder contained a bank-abbreviation glossary whose Thai and Chinese names decode to garbage; it has no transactions at all. The two real statements beside it decode cleanly.
- Avoid: confirm a file is a statement before drawing conclusions about a format from it — check for the grid, the frame block, and the summary, not just that text came out. Check every file in the folder before concluding, not the first one.
- Verify: the reader rejects a non-statement on its bank signature; a glossary produces `UNSUPPORTED_LAYOUT` rather than an attempted parse. Dated 2026-07-28 from `ece232f`, the read-through of all 16 files in `shared-statements/` that found the sixteenth was a bank-code reference sheet.

## A masking parser that fails open prints exactly what it was written to hide

- Symptom: a probe written to print only field *lengths* from a slip QR printed 20 whole payloads instead, each carrying a per-transaction reference and embedded date digits. The script had an explicit allowlist and still leaked, because the allowlist was consulted after the parse rather than the parse being required to succeed.
- Cause: the EMVCo TLV in a Thai slip QR nests the bank code and the reference inside a tag-`00` template. A parser that does not recurse reads that template as one opaque field, and a masker keyed on "tag `00` is safe metadata" then prints the whole blob. The failure is silent: the output looks structured and is wrong.
- Avoid: mask by default, and let a field become printable only after the parse has succeeded and consumed the entire payload. Assert `consumed == len(payload)` before printing anything. An unrecognised structure must print nothing, not its value — the same fail-closed rule the readers follow (D-039), applied to diagnostics.
- Verify: run the probe over one slip and confirm no run of payload characters appears in the output except the three-digit bank code. `lib/masked-diagnostics.ts` is the model — it is guarded by a test asserting no value survives it (D-038), which a scratchpad script is not. Dated 2026-07-30 from D-056's structural probe over the slip QRs, which is the leak D-060 later recorded as having reached three fixtures.

## The masked page-line dump cannot see what the reader did, and reading it as if it could produced a whole wrong diagnosis

- Symptom: a confident, written-down explanation of a refusal that survives into a decision record and a plan task, and is wrong in every part. D-054 diagnosed `KRUNGTHAI-01`'s three blockers as a compound row read as one component with an anomaly marker unset, and set `PLAN.md` task 23 to fix `lib/krungthai-layout.ts` accordingly. The statement has **zero** compound rows, the marker is never set by any reader, the blocking row's gap runs the opposite direction to the one recorded, and the layout file needed no change at all (D-055).
- Cause: the dump renders *lines*, the reader emits *rows*, and nothing connects them. Three specific ways it misleads. It masks digits, so a printed `0.00` and a real amount are both `d.dd` — "carries amounts in both money columns" cannot be read off it. It reports right edges while `assign` bands by midpoint (D-030), so agreeing geometry is not the geometry the reader used. And its line index is not the reader's row index, since continuation lines merge — so "the row after it" may be neither.
- Avoid: diagnose from the reader's own output. `readStatement(pages)` then `reconcileRows(frame.openingBalance, rows)` under vitest gives component counts, kinds, provenance and gaps directly, and reporting *relations* between figures — does this gap equal that component, does it equal 15% of it, is it positive — keeps it value-free without inferring anything. Use the dump afterwards, to explain a finding rather than to reach one, and align it by counting date-bearing lines to the reader's row index before trusting either.
- Verify: 2026-07-29. Four throwaway passes under `.runtime/` settled it. Pass 1 returned `compoundRows: 0` across all 233 rows, which alone falsified the recorded cause; pass 3 brute-forced the affected window and found exactly one ordering that closes the chain. Two facts were available the whole time and would have cast doubt on the diagnosis before it was written: the cross-check passed, so nothing was missing, and an existing green test already proved a two-money-column interest/tax line yields two components.

## A "value-free" probe leaks values when its allow-list assumes a flat structure

- Symptom: a script written to print only tag identifiers, field lengths and a whitelisted bank code prints entire transaction references instead.
- Cause: the whitelist named tag `00` as reportable, on the assumption that the payload was flat TLV. A Thai slip QR nests everything — bank code *and* reference — inside tag `00`, so "print tag 00's value" printed the whole identity block. The allow-list was correct about which *tags* were safe and wrong about what a tag contains.
- Avoid: allow-list on the leaf that will actually be printed, after parsing, rather than on a container whose contents are the thing being determined. When probing an unknown format, print lengths and character classes on the first pass and add values only once the structure is known.
- Note what it does and does not cost: reading a real value is permitted under D-049's successor scope, and this was a read. The rule it puts pressure on is the one that matters — nothing read may become a fixture, quotation or commit. Every slip fixture in this repo is built by `buildSlipQrPayload` from an invented reference for exactly that reason (D-056).
- Verify: 2026-07-30, during the task 20 sizing probe. Re-running with the allow-list moved to the inner tags printed lengths and character classes only.

## A placeholder that looks like a real value reads as a failed autofill

- Symptom: the owner asks why a field "doesn't autofill" a value it was never meant to fill. The field is empty and behaving correctly.
- Cause: the amount input's placeholder was `1250.00` — a plausible number, rendered grey. Grey text in a form field is ambiguous between "hint" and "value the app filled in for you", and a number resolves that ambiguity the wrong way. Browser validation then fires on submit for a field that looks populated, which compounds it.
- Avoid: a placeholder in a money or date field should be impossible to mistake for a value — words, not digits. Where a format hint is genuinely needed, put it in the help text where it reads as an example rather than as content.
- The broader point: this was found in the first ten minutes of an owner using the form, and no test could have caught it, because every test fills the field before looking at it. Owner-driven use keeps finding this class of defect here — the transactions view produced three refinements the same way (`PLAN.md` task 17).
- Verify: 2026-07-30. Placeholder replaced with text; the Buddhist-era and date-source help lines now say which value came from where.

## A value-free reporting rule guards the print, not the reuse hours later

- Symptom: real data appears in a committed fixture written by someone who knew the rule, had just applied it, and had explicitly said the leaked values would not be reused.
- Cause: the rule fires at the moment a value is *printed* and has nothing to say at the moment it is *reused*. By then the value no longer feels like a stolen sample — it feels like knowledge of the format, which is legitimately held. Writing tests that needed one reference shape per bank, three shapes were reproduced from what a probe had printed earlier in the same session (D-060).
- Avoid: when a fixture must reproduce a real *shape*, generate it from the grammar rather than recalling an instance. A builder usually already exists for this — here `buildSlipQrPayload` was used for the payloads while the references handed to it were pasted, which is the whole failure in one line. Treat "I saw this value earlier" as disqualifying it from a fixture, permanently, however structural it now looks.
- Second-order trap: the leak had already been written up as a gotcha, and the write-up said "nothing derived from it will reach a fixture". Recording a hazard is not the same as being protected from it, and a confident note about future behaviour is worth less than a mechanism.
- Verify: 2026-07-31. Found by the owner capturing a real slip and noticing its printed reference matched a fixture verbatim — no test, lint or review caught it, and none has been added that would.

### Tests, Playwright and the gate

## Narrowing a threshold constant makes its tests pass for the wrong reason, not fail

- Symptom: `MATCH_WINDOW_DAYS` drops from 3 to 1, the whole reconciliation suite stays green, and two tests have quietly stopped testing what they are named for.
- Cause: a test that discriminates between two candidates has to place both **inside** the window, or the window excludes the far one before the clause under test ever runs. "Prefers the nearest date instead of treating everything in the window as equal" and "does not let a far candidate block a pairing it could never win" both built their far candidate three days out. Under a one-day window that candidate is not a candidate at all, so each test passed while exercising the window rather than the nearest-date preference or the claim-resolution it names. Widening a threshold makes a bad fixture fail loudly; narrowing one makes it pass silently, which is why this direction is the dangerous one.
- Avoid: when a threshold moves, re-read every fixture built against the old value and ask what would still fail if the clause under test were deleted. Assert the constant itself in one place — `expect(MATCH_WINDOW_DAYS).toBe(1)` — so the value is pinned somewhere obvious, but do not mistake that assertion for coverage of the behaviour around it.
- Verify: with the far candidates moved to one day out, both tests still pass; delete the nearest-date filter in `proposeSlipMatches` and the preference test fails, which it did not before the fixtures were rebuilt (D-064). Dated 2026-08-05 from `0f32ad1`, the commit that narrowed `MATCH_WINDOW_DAYS` from three days to one (D-064).

## The synthetic path in the app UI does not exercise confirm_import

- Symptom: clicking through the running app reports a confirmed batch, yet no import reaches PostgreSQL and server-side contracts (digest binding, fingerprint binding) are never tested.
- Cause: `confirmSynthetic` in `app/import-bench.tsx` only sets browser state. Only the *bound* path — a parsed statement bound to a ledger account through the chooser — posts to `/api/v1/imports/confirm`, and that route is gated by authentication and `private.has_strong_owner_access` (aal2 + two verified TOTP factors). Reaching it needs a real PDF, so no automated browser run covers it.
- Avoid: do not treat a synthetic UI walkthrough as end-to-end evidence for import contracts. Check which button was pressed: "Confirm synthetic batch" is browser state, "Confirm import" is the route. Route contracts are covered by `tests/import-route.test.ts`, the RPC by pgTAP and `tests/import-confirm-e2e.test.ts`.
- Verify: `confirmSynthetic` contains no `fetch`; `confirmBoundImport` posts to `/api/v1/imports/confirm` and is reachable only once `boundAccount` is set. Dated 2026-07-24 from `9203a87`, the foundation commit that introduced `confirmSynthetic` as browser-only state.

## Playwright reuses a server someone else started, so browser runs can test stale code

- Symptom: a browser test keeps failing on behaviour you just fixed, with the identical error every run, while the unit suite covering the same logic is green. Or the reverse — it passes after a change that could not possibly work.
- Cause: `playwright.config.ts` **as committed** sets `reuseExistingServer: !process.env.CI`, so if anything is already listening on port 3000 the `pnpm build && pnpm start` command never runs. A server started by hand keeps serving the build it booted with, no matter how much source changes afterwards.
- **Verified 2026-08-09, and the state is split.** All three configs in this working tree read `reuseExistingServer: false`; `playwright.isolated.config.ts` and `playwright.owner.config.ts` carry that in git, but `playwright.config.ts` does not — it is one of the deliberately uncommitted files (D-070), so **`git show HEAD:playwright.config.ts` still reads `!process.env.CI`**. The trap is therefore fixed on this machine and live for any fresh clone. Do not read a comment as the code: `playwright.isolated.config.ts:5` quotes `!process.env.CI` while describing the *default* config, and its own setting on line 27 is `false`.
- Avoid: run `pnpm exec playwright test --config=playwright.isolated.config.ts`, which uses port 3100 and never reuses a server (D-027). If using the default config, first compare the listening process's start time with the source mtime — `Get-NetTCPConnection -LocalPort 3000 -State Listen` for the pid, `(Get-Item .next\BUILD_ID).LastWriteTime` for the build.
- Verify: three consecutive runs reported `MISSING_COLUMN_ANCHOR` against a reader that no longer had those anchors; the build was 16 minutes older than `lib/krungthai-layout.ts`.

## The default config runs the owner suite twice at once, so its two copies wipe each other's fixtures

- Symptom: `owner-session.spec.ts` fails against `playwright.config.ts` with rows missing, an account absent, or a count short — and the same spec passes against `playwright.owner.config.ts`. The failures move between runs and between tests, so each one reads as a different defect.
- Cause: `playwright.config.ts` sets `fullyParallel: true` with **two projects** (`desktop`, `mobile`) and **no `testIgnore`**, so that spec is collected under both and the two copies run concurrently against one database. Its `beforeEach` deletes the *shared seeded owner's* ledger tables — it is not scoped to a project, a worker or a test — so each copy's cleanup destroys the other's fixtures mid-test. `playwright.owner.config.ts` sets `fullyParallel: false` and a single project for exactly this reason.
- **This was masked until 2026-08-10 and is newly reachable.** The committed copy of this config runs `pnpm dev`, which never hydrates under the strict CSP, so those tests could not really execute and the collision never showed. The deliberately uncommitted working copy runs `pnpm build && pnpm start`, which makes them execute — so the trap is **live on this machine and dormant in a fresh clone**, the reverse of the `reuseExistingServer` entry above.
- Avoid: run the owner specs through `playwright.owner.config.ts`, which is what the gate uses. Never use the default config for a green run — it is the port-3000 config for driving the app by hand.
- Verify: `playwright.config.ts` has `fullyParallel: true`, two entries under `projects`, and no `testIgnore` key; `playwright.owner.config.ts` has `fullyParallel: false` and one project. Dated 2026-08-10, read from both files rather than from a failing run — the collision is structural and was found by reading, not reproduced.

## The default config gives `prebuild` and a full `next build` the 60-second webServer default

- Symptom: a browser run against `playwright.config.ts` dies with a Playwright webServer timeout before any test starts, on a checkout where nothing is wrong. Most often on a fresh clone, after `.next/cache` is cleared, or on the first run after a dependency change.
- Cause: that config sets no `webServer.timeout`, so Playwright's 60-second default has to cover the whole `pnpm build && pnpm start` command — including `prebuild`, which copies the ZXing reader and the four tesseract assets, and then a full Next production build. A warm build fits comfortably; a cold one need not, and the failure names the web server rather than the build that actually ran long.
- Avoid: set `webServer.timeout` on any config whose `command` builds. `playwright.owner.config.ts` sets 180 seconds for the same command shape and is the value to copy.
- Verify: `playwright.config.ts` has no `timeout` key inside `webServer` while `playwright.owner.config.ts` sets one; both run `pnpm build && pnpm start`. Dated 2026-08-10, read from the two configs — the slow path was not reproduced, so this is a bound that has been shown to be missing rather than one measured against a cold build.

## `fullyParallel: false` serialises a file, not a suite, and looks serial while there is one file

- Symptom: a browser test that passes every time it is run alone fails whenever the whole config runs. Here the message was `That code was not accepted: Auth session missing!` from a client that had demonstrably just used its session — the enrolment call immediately before it succeeded. An earlier run of the same fault showed a factor count that never advanced, with no error anywhere.
- Cause: `fullyParallel: false` serialises tests **within** a file. Separate files still go to separate workers, and Playwright's default worker count is half the machine's cores. `playwright.owner.config.ts` had one spec file from the day it was written, so it had always *behaved* serially without ever *being* serial. Adding a second file on 2026-08-10 put two suites on one seeded owner at once: `owner-session.spec.ts` signs in on every test, `owner-access.spec.ts` deletes and re-enrols that owner's MFA factors, and a second sign-in rotates the refresh token the first one's browser client is holding — so its next auto-refresh fails and supabase-js clears the session locally. Nothing in the message names a worker, a file, or the other suite.
- **The tell that separates this from an ordinary flake**: the reporter's `[n/total]` indices interleave the two files (`[1]` access, `[2]` session, `[3]` session, `[4]` access). Under one worker the indices for a file are adjacent. Read the interleaving, not the failure.
- Avoid: set `workers: 1` explicitly on any config whose specs share one database identity. `fullyParallel: false` is not that guarantee and never was. `playwright.owner.config.ts` now sets both.
- Verify: with `workers: 1` the same 25 tests pass and the two files' indices are adjacent; removing it reproduces two failures in `owner-access.spec.ts` alone, both of which pass when that file is run by itself. Dated 2026-08-10.

## A 200 from the app proves a server is running, not that it is the one you just started

- Symptom: a server is started in the background, a health check answers `HTTP 200` with the expected headers, and the app being driven is nonetheless the *previous* build — old wording, old constants, old behaviour. The background task quietly reports failure some time later, long after the check appeared to succeed.
- Cause: `next start` cannot bind a port another `next start` already holds, so the second one dies with `EADDRINUSE` while the first keeps serving. Every response still looks right, because the CSP, the route list and the status code are identical across builds — the differences are in a client chunk nobody fetched. On 2026-08-11 a server from 16:58 served a check against a build made at 17:52.
- Avoid: stop the old server before starting a new one, and **verify by timestamp rather than by response**. `Get-NetTCPConnection -LocalPort 3000 -State Listen` gives the pid, `(Get-Process -Id <pid>).StartTime` its age, and `(Get-Item .next\BUILD_ID).LastWriteTime` the build's — the server must be the newer of the two. This is the same lesson as the `reuseExistingServer` entry above, arriving by a different route: there Playwright reused someone else's server, here a new one failed to displace it.
- Verify: with the stale process killed and the server restarted, `StartTime` is later than `BUILD_ID`'s mtime. Dated 2026-08-11.

## A config that ignores one spec file by name is a list of one, not a rule

- Symptom: a new browser spec fails under a config it was never meant for, four times over — once per project — with `SyntaxError: Unexpected token 'N', "Not Found" is not valid JSON`. That is a 404 body being parsed as the JSON the test expected, and it names neither the route nor the config.
- Cause: `playwright.isolated.config.ts` carried `testIgnore: /owner-session\.spec\.ts/u`, which reads as a rule about owner-signed-in specs and is actually one file name. It builds with `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "0"`, so the development sign-in route correctly answers 404 — the guard working — and any spec needing a session fails on the response body rather than on the guard. The same shape applies to `playwright.owner.config.ts`'s `testMatch`, which had to grow too.
- Avoid: when adding an owner-signed-in spec, change **both** patterns in the same edit — `testMatch` in the owner config to collect it, `testIgnore` in the isolated config to skip it. Both now read `/owner-(session|access)\.spec\.ts/u`.
- Verify: the isolated config reports 18 passed with no owner spec collected; the owner config reports 25 and lists both files. Dated 2026-08-10.

## A unit suite that feeds the layout reader fixtures proves nothing about reading a PDF

- Symptom: 27 green parser tests, a green build, and a green Playwright run, while the app cannot open any PDF at all.
- Cause: `tests/krungthai-layout.test.ts` calls `extractStatement` with `PageText` arrays, and the synthetic UI path fetches `/api/v1/demo`, so neither touches `getDocument`, the worker bundle, or the CSP. The layout rules and the PDF integration are separate risks, and only the first was covered.
- Avoid: keep at least one test that puts real PDF bytes through the real worker in a real browser. `tests/fixtures/synthetic-pdf.ts` generates those bytes from the same invented geometry, so this needs no real statement — a Type0/Identity-H font with an identity ToUnicode CMap and no embedded glyphs is enough, because pdf.js recovers text from ToUnicode rather than from outlines.
- Verify: `pnpm test:e2e` runs 8 tests, of which 4 are the parser specs across desktop and mobile. Dated 2026-07-25 from `6c1e536`, which added `tests/e2e/parser.spec.ts` — the first test to put real PDF bytes through the real worker (D-023, D-027).

## Database-driving tests race each other under Vitest file parallelism

- Symptom: suites pass individually but fail when the whole suite runs — typically the backup round-trip and the import e2e, which wipe or insert against the same owner.
- Cause: Vitest runs test files in parallel by default, and every suite here shares one local Postgres instance.
- Avoid: keep `fileParallelism: false` in `vitest.config.ts`. The suite takes seconds, so serial execution costs little compared with debugging a nondeterministic failure.
- Verify: `pnpm test` passes with all nine files; reverting the setting reproduces three failures across the two database-mutating files. Dated 2026-07-25 from `b138c72`, the commit that set `fileParallelism: false` after the second database-mutating suite landed.

## Leftover test accounts collide on a unique constraint in another suite

- Symptom: `tests/import-route.test.ts` and `tests/import-confirm-e2e.test.ts` both fail at setup with `duplicate key value violates unique constraint "accounts_owner_id_bank_code_last_four_key"`, naming neither the suite nor the file that caused it.
- Cause: `public.accounts` is unique on (owner_id, bank_code, last_four), there is exactly one owner, and every suite that binds the synthetic statement wants an account ending 7890. A suite that inserts one and does not remove it breaks the next suite rather than itself.
- Avoid: clean up in `afterAll`, not only in `beforeEach` — a run that ends leaves the database as it found it. `resetOwnerImportSurface` takes the account ids to drop.
- Verify: run the browser suite and then `pnpm test`; both pass in either order. Dated 2026-07-25 from `a49fad3`, the commit that recorded the collision and the `afterAll` cleanup for it.

## `pnpm test` deletes every row the owner has, not just the test's own

- Symptom: a ledger holding a real import is empty after a routine test run, or a suite aborts with "Refusing to wipe the ledger: N account(s) … created by neither the seed nor this suite".
- Cause: `resetOwnerImportSurface` deletes `source_transactions`, `source_components`, `import_batch_rows`, `import_batches`, `import_artifacts` and `audit_events` **scoped to the owner**, not to the suite — and there is one owner. `tests/backup-roundtrip.test.ts` goes further and deletes every row unscoped between its export and its restore. Harmless against a seed; destructive against anything real.
- Avoid: the abort is the guard (`assertOnlyDisposableLedgerData`) doing its job — do not reach for `ALLOW_DESTRUCTIVE_TESTS=1` to make it quiet. Take a backup through Recovery / 04 first, and only then decide the data is disposable. Note `pnpm supabase:reset` is the Supabase CLI and cannot be guarded at all.
- Verify: with a real account present, `pnpm exec vitest run tests/backup-roundtrip.test.ts` fails with the refusal instead of wiping; with that account passed in as recognised, the same check counts zero. Dated 2026-07-28 from `663f626`, the commit that added `assertOnlyDisposableLedgerData` after the first real import made this destructive (D-047, D-048).

## A bare tag locator is a contract only while the page holds one of that tag

- Symptom: every browser spec in a suite fails at once with `strict mode violation: locator('input[type="file"]') resolved to 2 elements`, after a change that touched none of them.
- Cause: the specs located the statement file input and the account chooser by tag. Adding a restore file input and an account-type select — both on unrelated parts of the page — made each selector ambiguous everywhere.
- Avoid: give form controls a `name` and locate by it (`statement-pdf`, `ledger-account`, `restore-file`, `restore-password`, `ledger-backup-password`, `new-account-label`, `new-account-type`). Treat a bare tag locator as a latent failure whenever a page is about to gain a second control of that kind.
- Verify: the owner suite passes 8/8 with two file inputs and two selects rendered on the same page. Dated 2026-07-27 from `b4df30c`, the recovery commit whose second file input and account-type select made the bare selectors ambiguous (D-046).

## Running a browser suite leaves `.next` aimed at whatever that suite pinned

- Symptom: after a Playwright run, `pnpm start` serves an app talking to the **test** project. The real ledger appears empty — three seeded accounts, no transactions — and an export taken then would be a backup of the seed rather than of anything real.
- Cause: every browser config's `webServer.command` begins with `pnpm build`, and `NEXT_PUBLIC_*` are inlined at build time. `playwright.owner.config.ts` pins `54321`, and shell pins used for the other configs do the same, so the last build left in `.next` is whichever the suite wanted — not what `.env.local` says.
- Avoid: **rebuild before driving the app by hand after any suite run.** `pnpm build` with a clean shell picks `.env.local` back up. Confirm rather than assume.
- Verify: grep the build for the **full URL**, `http://127.0.0.1:5434 1` without the space — `grep -rlo 'http://127.0.0.1:54341' .next/server .next/static` should hit and the `54321` form should not. After the 2026-07-28 gate the live form appeared in no file and the test form in two, despite `.env.local` pointing at live.
- **Do not grep the bare port. That check was valid until 2026-07-28 and is not any more:** `containerFor` in `app/api/v1/dev/session/route.ts` embeds `54321`, `54331` and `54341` as a lookup table so its remedy message can name the right container, so every build now contains all three numbers regardless of what it targets. A bare-port grep on a correctly aimed build reads as ambiguous and invites exactly the wrong conclusion.

## Two of the three Playwright configs pin their Supabase target in git; the third's pin is uncommitted

- Symptom: after `.env.local` was pointed at the live ledger (D-048), a browser suite builds and runs against **real financial records**. Nothing announces it, because the app behaves identically.
- Cause: `NEXT_PUBLIC_*` are inlined at build time, so a config that runs `pnpm build` with no `webServer.env` inherits whatever `.env.local` names. **Originally only `playwright.owner.config.ts` pinned** — its comment claimed pinning "removes the one path by which a configuration change could aim the suite at real data", true of that config alone and worth reading as scoped rather than general.
- Avoid: **fixed 2026-07-28** — both now carry `webServer.env` (PLAN task 16). The isolated config pins all four variables, the default config the three database ones. The database-level wipes in `tests/helpers/local-owner.ts` hardcode the test container and were safe either way; it is the *browser* half that follows the build.
- **Still open:** `playwright.config.ts` is intentionally uncommitted, so its pin is local to this machine and a fresh clone gets the unpinned file. Check it before running that config on a new checkout.
- Verify: the isolated suite passes 14/14 in a shell with no pins set, where it read 12/14 before; live's account-id, transaction-id and fingerprint digests were unchanged by the run. That comparison, not the passing count, is what shows the target was right.

## The isolated suite's "no dev sign-in" test fails once `.env.local` opts in

- Symptom: `ledger.spec.ts` "offers no development sign-in in a build that did not opt into one" fails on desktop and mobile, 12/14 instead of 14/14, against code that did not change.
- Cause: D-048's migration requires `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1` in `.env.local` permanently, and `playwright.isolated.config.ts` does not pin it, so the build *does* opt in and the test's premise is false. The same shape as D-047: a milestone changed the environment and an existing command silently became wrong.
- Avoid: pin `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` to `"0"` — **not** `""`. On Windows, `$env:VAR = ""` deletes the variable rather than blanking it, so `.env.local` wins and the failure persists, which reads misleadingly like the pin not working.
- Verify: 12/14 with the flag inherited, 14/14 with it pinned to `"0"`, no code change between the two runs. Dated 2026-07-28 from `663f626`, the D-048 work that made the opt-in flag permanent in `.env.local`.

## Stubbing a browser API can hide which code path the test is exercising

- Symptom: new specs pass, ten unrelated specs fail, and later the stubbed feature turns out never to have worked on this platform at all.
- Cause: the slip specs stubbed `BarcodeDetector`. Headless Chromium has none — a fact the stub concealed twice over. It hid that the "no QR reader" notice rendered for every *other* spec (breaking their `getByRole("status")` lookups), and it hid that the native detector is unavailable on Windows desktop entirely, so the feature could not run on the developer's own machine (D-057).
- Avoid: prefer a real artifact through the real code path when one can be generated. A QR can be rendered to a PNG from an invented payload (`tests/fixtures/synthetic-slip.ts`), exactly as statements are rendered to real PDFs — after which the specs exercise the decoder instead of a fake. Where a stub is genuinely unavoidable, assert what the *unstubbed* environment does somewhere too, or the stub becomes the only thing keeping the test green.
- Verify: 2026-07-30. Replacing the stub with generated QR images kept all five specs green and additionally caught the wasm resolution failure above, which the stubbed versions passed straight through.

## A source-grep test keeps passing after the thing it names becomes false

- Symptom: a test called "does not register a service worker or install observation tooling" passes green in a commit that registers a service worker. Separately, a test asserting responses are `no-store` fails for a reason that has nothing to do with caching.
- Cause: both assert by reading source files. The first greps `app/ledger-app.tsx` and `app/transactions-view.tsx`; the worker was registered in `app/slip-capture.tsx`, so the grep looked at two files that happened to still be innocent and the test's own name became a lie. The second greps `next.config.ts` for the literal `value: "no-store"`; moving the header into `lib/security-headers.ts` broke it without changing any behaviour at all.
- Avoid: assert the produced value, not the text that produces it, whenever the value is importable — `securityHeaders(...)` returns the real header, so the test now checks it. Where a source grep is genuinely the right tool (proving an *absence* across a directory), derive the file list rather than hard-coding two of them, and make the assertion say which files it inspected.
- The sharper lesson: a green test whose name asserts something false is worse than no test, because it is read as evidence. When adding a capability the codebase previously forbade, grep the suite for the old prohibition before assuming nothing covered it.
- Verify: 2026-07-30. The service-worker test now enumerates candidate files and asserts registration appears in exactly one, plus that the worker has a single fetch handler, no precache list and exactly one `cache.put` — it fails if a second registration or an app-shell cache is added.

## Running the browser gate deletes whatever you captured by hand in the test project

- Symptom: a slip captured through the UI, or a statement imported by hand, is simply gone the next time you look — with no error and no sign anything happened.
- Cause: `tests/e2e/owner-session.spec.ts` calls `resetOwnerImportSurface` in `beforeEach` **and** `afterAll`, which deletes the seeded owner's slips, transactions, batches and artifacts. That is correct — a suite that left rows behind would fail its own next run on their fingerprints — but the owner drives the app as that same seeded owner in that same project, so hand-made data is inside the blast radius.
- Avoid: treat anything you create by hand in `private-ledger-local` as disposable, and re-create it after a gate run. Do not reach for the live project instead to keep it — since 2026-08-05 it does have a `slips` table (D-065), which makes this *more* dangerous rather than less: a slip captured there is a real mutation of real records, it is append-only and cannot be deleted, and it invalidates the standing backup by bumping the mutation sequence. If a hand-captured state must survive a test run, note what it was and re-enter it; there is no fixture path for it by design, since fixtures are invented.
- Verify: 2026-07-31. `public.slips` held 1 row captured through the UI; after `playwright.owner.config.ts` ran, the same query returned 0, alongside 0 transactions and the 3 seeded accounts.

## An axe pass on a route that loads nothing proves nothing about what the route renders

- Symptom: an accessibility gate reports a clean pass on `/ledger` while a control added to every row of the ledger table has never been examined by it.
- Cause: `tests/e2e/ledger.spec.ts` visits each route and analyses it as delivered. This app loads nothing until asked (`PLAN.md` task 17), so the ledger it checks has no table, no rows, and none of the per-row controls — and a per-row control is precisely where an accessible name is most likely to be missing or duplicated down a column.
- Avoid: read the isolated suite's axe rows as covering the *shell* of a route. Anything behind a load button needs its own axe call in the owner suite, where a session and real rows exist — one per state, since a table that shows a matched row and one that shows a provisional row have different controls on them.
- Verify: 2026-08-07. Two `AxeBuilder` passes scoped to `section.ledger-band` inside the D-068 spec, one after the undo and one after the re-match, both clean; the isolated suite's 18/18 is unchanged by controls it never sees.

## `locator.click().catch(() => {})` does not skip a missing control, it burns the timeout

- Symptom: a spec fails on a line that has nothing to do with the problem — typically `Target page, context or browser has been closed` at the *next* action — after running for the full test timeout.
- Cause: a Playwright locator action on an element that never appears waits until the test deadline before rejecting. Wrapping it in `.catch()` swallows the rejection but not the wait, so the whole budget is gone and everything after it fails against a torn-down page. Written as an "optional step", it reads as harmless and is the most expensive line in the file.
- Avoid: decide whether the control is there rather than trying it optionally. `if (await locator.count())`, or a short explicit `{ timeout: 2000 }` when a genuine race is being tolerated. Better still, know the state: after a successful capture the form resets, so the Discard button is *gone* — the optional click existed only because the spec had not thought about what the previous step left behind.
- Verify: 2026-08-09. The second capture in `captures a slip from its QR…` now chooses the next image directly; the spec runs in ~7s where the optional click made it fail at 30s.

## A rediscovered trap is not a new one — check before adding an entry

- Symptom: an entry is written up as a fresh discovery, in detail, describing something this file already recorded three days earlier.
- Cause: on 2026-07-31 the bare-port `.next` grep was hit again, investigated from scratch, and written up as new. **The existing entry above already covered it** — "Do not grep the bare port. That check was valid until 2026-07-28 and is not any more" — including the same `containerFor` cause and the same remedy. The duplicate was caught only by a validation pass on the following day.
- Avoid: grep this file for the symptom before writing an entry. It is long enough that reading it end to end is not realistic, which is exactly why the grep is the habit — and the same applies before "discovering" anything in `DECISIONS.md`.
- Verify: 2026-08-01. The duplicate was removed and this entry replaces it; the original coverage is under the build-target entry earlier in this file.

### App, auth, routing and accessibility

## Strict production CSP can block the Next.js development runtime

- Symptom: Playwright clicks do nothing, no API request is made, and the browser reports that development `eval()` is blocked.
- Cause: React and Next.js development tooling require behavior intentionally forbidden by the production CSP.
- Avoid: run browser acceptance tests against `pnpm build && pnpm start`; do not weaken the production CSP with `unsafe-eval`.
- Verify: the synthetic flow and accessibility tests pass against the production server without CSP console errors. Dated 2026-07-24 from `9203a87`, the foundation commit that set the strict `Content-Security-Policy`.

## Signing in again at aal1 downgrades a shared Supabase cookie session

- Symptom: tests that share one stored session start returning 403 "AAL2 and two verified TOTP factors are required" after an unrelated test deliberately signs in without MFA — and re-storing the aal2 session does not fix them.
- Cause: a password sign-in replaces the stored session for that storage key, and a token later refreshed in that family is no longer aal2. `setSession` with the old access token does not reliably restore the stronger claim.
- Avoid: order aal1 and unauthenticated cases after every test that needs strong access, rather than trying to restore the strong session between them. Mint a fresh aal2 session if a test genuinely needs one after a weak sign-in.
- Verify: `tests/import-route.test.ts` keeps its `without strong owner access` block last; moving it earlier reproduces a cascade of 403s in the tests that follow. Dated 2026-07-28 from `119bba2`, the commit whose subject names this — "the sign-in stops eating itself".

## Only one ledger owner can ever exist locally

- Symptom: inserting `mutation_sequences` or `accounts` for a freshly created auth user fails with a foreign key violation against `ledger_owners`.
- Cause: `public.ledger_owners` holds a single binding row and is immutable — a trigger rejects updates and deletes — so a second owner cannot be bound without resetting the database.
- Avoid: authenticate as the seeded synthetic owner (`supabase/seed.sql` sets its password) instead of creating a new user.
- Verify: `select * from public.ledger_owners` returns exactly one row, and the import e2e signs in as that owner. Dated 2026-07-24 from `9203a87`, the foundation commit that introduced `public.ledger_owners` and its single-owner binding.

## A guard keyed on `NODE_ENV` is unreachable in the build that must exercise it

- Symptom: a development-only route or affordance works under `next dev` and is untestable in the browser suite, or a spec written against `next dev` sees clicks do nothing at all.
- Cause: two constraints meet. Browser tests here run against `pnpm build && pnpm start`, because the strict CSP forbids the `eval()` React needs in development mode (see the CSP entry above) — and `next build` sets `NODE_ENV=production`, so anything gated on `NODE_ENV !== "production"` is switched off in exactly that build.
- Avoid: gate on an explicit opt-in flag the test config sets, not on the build mode — `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` in `playwright.owner.config.ts` (D-036). A `NEXT_PUBLIC_` flag is inlined at build time, so it must be set for `pnpm build` as well as for `next start`; Playwright's `webServer.env` covers both. Never relax the CSP to make `next dev` work.
- Verify: `tests/dev-session.test.ts` asserts a 404 without the flag; `tests/e2e/owner-session.spec.ts` passes only under its own config and self-skips elsewhere. Dated 2026-07-25 from `316cdac`, the commit that introduced `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` in place of a `NODE_ENV` check (D-036).

## A leftover TOTP factor makes a later sign-in unable to reach aal2

- Symptom: an authenticated suite fails at enrollment with `403 insufficient_aal`, "AAL2 required to enroll a new factor", on an owner whose password is correct.
- Cause: GoTrue refuses to enroll a factor at aal1 once the user has a verified one. `tests/backup-roundtrip.test.ts` inserts two factors directly and never removes them, so any suite that afterwards tries to climb to aal2 by enrolling cannot.
- Avoid: delete `auth.mfa_factors` for the owner before signing in, not only in teardown — teardown does not run for a suite that was never reached.
- Verify: the failure reproduces by running `tests/backup-roundtrip.test.ts` and then any suite that enrolls — that is how it was found. `tests/recovery-portability.test.ts` clears factors on both projects before signing in and again in teardown.
- **Its remedy message names the wrong database since D-048.** The hint reads `docker exec -i supabase_db_private-ledger-local …`, hardcoded to the test project. Once `.env.local` points at `private-ledger-live`, the stale factors are in **live** and that command clears nothing — on 2026-07-28 test held 0 factors and live held 2. Substitute `supabase_db_private-ledger-live` when the app is aimed there. Deleting them is safe: `auth.mfa_factors` is not among the eleven backed-up tables, and the development sign-in re-enrols on the next attempt.
- A second route into it, also seen 2026-07-28: the owner Playwright suite signs in against the **test** project and rewrites `.runtime/dev-mfa.json`, so afterwards the secrets on disk no longer match the factors sitting in live. Running the browser gate and then driving the live app by hand reproduces it.
- **`pnpm test` did this too, which the line above missed.** `tests/dev-session.test.ts` drives the real route against the test project, and the route calls `saveFactors` — so any unit run, not only the browser gate, overwrote `.runtime/dev-mfa.json` with test-project secrets. A live browser session already at aal2 kept working because its cookie is minted; the next live *sign-in* is what failed, which is why the lock-out seemed to come from nowhere.
- **Both halves are fixed as of 2026-07-28, and the fix is the reason this entry now reads as history.** The remedy message is derived rather than hardcoded (`containerFor`), so it names the project the running build is aimed at; and the secret store is keyed per project (`.runtime/dev-mfa-<project>.json` via `storeFor`), so a run against one project cannot invalidate another's secrets. `tests/dev-session.test.ts` clears only the test project's file.
- Verify: hash `.runtime/dev-mfa-private-ledger-live.json`, run the full `pnpm test`, hash it again — it must be byte-identical while `dev-mfa-private-ledger-local.json` is rewritten. Confirmed twice on 2026-07-28 after a real live sign-in. **What the fix cannot do is recover secrets already lost**: factors enrolled before it, whose secrets went with the shared file, still have to be cleared once so fresh ones can be enrolled. A stale `.runtime/dev-mfa.json` left over from the shared-store era is inert and can be deleted.

## Creating a ledger account before the import is proven leaves one that cannot be removed

- Symptom: an account with zero rows sits in the ledger permanently, showing up in the transactions view's `Imported accounts: N of M` line as a gap that never closes.
- Cause: the natural order — create the account, then import into it — writes the account first and only then discovers the import is refused. `public.accounts` has no delete path *by design*, because `source_transactions.account_id` references it, so there is no undoing it.
- Avoid: assemble first. `assembleImportPayload` performs the binding checks and the reconciliation, so a statement that will be refused is known **before** anything is written. Create the account only once assembly returns ok.
- Verify: happened on 2026-07-29 with the Krungthai statement (D-054). The empty account is still there and will be until the statement imports.

## A `role="status"` added to a static notice breaks every existing spec that looks one up by role

- Symptom: ten owner-session specs that passed the day before all fail at their sign-in step with `strict mode violation: getByRole('status') resolved to 2 elements`, after a change that touched none of them. The new feature's own specs pass.
- Cause: a new section rendered a "this browser cannot do X" notice as `role="status"`. Playwright's `getByRole` is strict, so a second status live region anywhere on the page breaks any helper that resolves one. The new specs passed because they stub the capability the notice reports on — so for them the notice never rendered, while for every other spec, running in headless Chromium without `BarcodeDetector`, it always did. The stub hid the regression from precisely the tests that would have caught it.
- Avoid: `role="status"` is for what just happened, not for what is true. Static explanatory text is a plain paragraph. When adding a live region to a shared page, grep the specs for `getByRole("status")` first — and treat "my new tests pass but old ones fail" as evidence about the new tests' fixtures, not about the old tests.
- Verify: 2026-07-30. Owner suite went 5 passed / 10 failed to 15/15 with the role attribute removed and nothing else changed.

## Splitting one page into routes breaks specs whose subject has nothing to do with routing

- Symptom: after a routing change, eight browser specs fail on `locator('input[name="statement-pdf"]') — waiting for locator`, in two files about the PDF reader and the layout readers. Nothing about parsing changed.
- Cause: every spec navigated to `/`, which used to render the whole app. `page.goto("/")` is an invisible dependency on there being one page, and it is spread across files by subject rather than collected anywhere. Updating the specs whose *subject* was the routing (the ledger and owner-session suites) left the rest pointing at a route that no longer holds the control they use.
- Avoid: before splitting a page, grep the whole browser suite for `goto(` and fix every hit, not the files the change is "about". The failure message names a missing locator, so it reads as a broken selector rather than as a spec on the wrong page — which sends you looking at the component that is fine.
- Verify: 2026-07-31. The isolated suite ran 8 failed / 10 passed with two files unfixed, and 18/18 once `parser.spec.ts` and `statement-pdf.spec.ts` were pointed at `/import`.

## A second `role="status"` in the shell makes every existing status assertion ambiguous

- Symptom: a live region added to a shared header turns unrelated specs red with `strict mode violation: locator resolved to 2 elements`, on assertions that were not touched.
- Cause: `getByRole("status")` matches every element with that role on the page. Each route here already has exactly one status line, and specs read it unscoped. A shell element carrying `role="status"` — or an `<output>`, which computes to the same role — appears on all of them at once.
- Avoid: a shell-level announcement can use `aria-live="polite"` on a plain element, which announces identically and does **not** compute to `role="status"`, and specs then target it by class. Where a second status role is genuinely wanted, scope the existing assertions to their section first, in a separate change, so the two failures do not arrive together.
- Verify: 2026-07-31. `app/site-header.tsx` uses `aria-live` and `signIn()` reads `.session-state`; owner-session passes 16/16 with per-route status assertions untouched.

## An `aria-label` replaces a button's words rather than adding to them, and axe says nothing

- Symptom: a Playwright locator asking for a button by the words printed on it times out, and the button is plainly there in the trace. It reads as a bad selector.
- Cause: `aria-label` **overrides** the visible text as the accessible name. A button reading `Not this slip` labelled `This slip is not the row dated 10 Jun 2026` has an accessible name that does not contain its own words, so `getByRole("button", { name: "Not this slip" })` cannot match. The real cost is not the test: it breaks WCAG 2.5.3 (label in name), so a voice-control user saying what is written on the button reaches nothing. axe passes it — the element *has* a name, and axe cannot know the name is not the one on screen.
- Avoid: when a repeated control needs a per-row name, **start the label with the visible text** and append the distinguishing detail — `This is it — 10 Jun 2026 at 11:05, balance ฿7,850.00`. Locate it in tests by an anchored prefix on the visible words, and by the row it sits in for the rest.
- Verify: 2026-08-07. Both D-069 controls relabelled; the spec locates them by `/^Not this slip/` and `/^This is it/` and passes, with the two axe passes over the loaded ledger still clean — which is the point: axe was clean before the fix too.

## A control that disables itself takes the focus with it

- Symptom: activating a button by keyboard appears to work — the mode changes, the live region announces it — but the next Tab starts from the top of the document. Nothing is reported by axe, and every text assertion in the suite passes.
- Cause: a browser blurs an element that becomes `disabled`, and focus falls to `<body>`. Any control whose own click disables it does this: `onClick={() => setMatching(id)}` on a button whose `disabled` prop reads the same state. An `aria-live` announcement does **not** restore a position in the tab order — it says what happened and leaves the user nowhere.
- Avoid: when an interaction replaces the controls on screen, move focus deliberately to a control that is certainly present in the new state — the way out of the mode is usually the right one. A `ref` plus a `useEffect` on the mode flag is enough. Assert it: `await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused()`.
- Verify: 2026-08-07. `app/transactions-view.tsx` focuses the picking mode's `Cancel`; `tests/e2e/owner-session.spec.ts` asserts it. Found by review, not by the suite — the axe passes over that exact screen were green before and after.

## `readError` takes a parsed body, so handing it a `Response` silently shows the fallback

- Symptom: a route's carefully worded refusal never reaches the screen. The user sees the generic sentence the caller passed as a fallback, every time, for every failure — which reads as "the server said nothing useful" rather than as a bug.
- Cause: `readError(body, fallback)` in `lib/wire.ts` looks for an `error` key on an already-parsed object. A `Response` has no such key, so the check falls through to the fallback and nothing throws. `await readError(response, …)` compiles, runs, and is wrong: `await` on a non-promise is a no-op, and TypeScript accepts it because the parameter is `unknown`. The correct call is two lines — `const body: unknown = await response.json().catch(() => null)` and then `readError(body, …)`.
- Avoid: read the signature rather than the name. Every other caller in `app/` does it correctly, which is what makes the one that does not hard to spot by eye; grep for `readError(response` before trusting an error path you have not seen fire.
- Verify: 2026-08-10, found while writing `app/cash-entry.tsx` by copying the pattern from `app/slip-capture.tsx`, and **fixed in that file the same day**. What it had been hiding: the capture route words two refusals specifically — a Buddhist-era date and an unknown category — and neither had ever reached the screen. No test caught it and none does now; the suites assert the success path, and the two refusals are reachable only from a real form. `grep -rn "readError(response"` returns nothing, which is the check worth repeating.

## Stripping whitespace lets an unanchored numeric group swallow the next field

- Symptom: a reader works on two of three layouts and reports "no line on this image reads as a date" about a slip that plainly prints one. Every unit test passes, because the failing layout's test asserted only that the read was refused, not *which* refusal it was.
- Cause: `normalise` in `lib/slip-ocr.ts` removes all whitespace before matching, because Thai has no inter-word spaces and where an OCR engine breaks a run is its business. Krungthai and SCB separate the year from the time with a hyphen, so `2569 - 09:05` survives as `2569-09:05` and reads correctly. **KBANK separates them with spaces alone**, so `69  11:38 น.` arrives as `6911:38น.` and a greedy `\d{2,4}` takes the year as `6911`. That converts to an implausible era year, fails closed, and the line is discarded as "not a date" — a correct-looking refusal reached for the wrong reason.
- Avoid: anchor the tail. Requiring the match to consume to the end of the line makes the four-digit reading fail and the two-digit one succeed by backtracking, which is the correct split rather than a lucky one. The general rule is the part worth carrying: **once whitespace is stripped, every field boundary has to come from the grammar**, because the only thing separating two numbers is gone. Any `\d{n,m}` sitting next to another numeric field is this bug waiting.
- Verify: 2026-08-10, found while building `readPrintedDate` and caught by the KBANK test asserting `DATE_YEAR_UNRESOLVED` rather than merely `ok === false`. That assertion *is* the check: before the anchor the call returned `DATE_NOT_FOUND`, which a test on `ok` alone cannot distinguish.

## Re-seeding the Supabase cookie jar per `describe` block makes every later test 403

- Symptom: a route suite passes its first group and then returns **403 on every test after it**, including tests that assert a pure zod refusal and never reach the database. The failures read as an authorisation regression in the route, which is exactly what they are not — the first group proves the same route authorises fine.
- Cause: the helper pattern stores one `OwnerSession` in a module-level variable and replays it into `@supabase/ssr`'s cookie writer. **The requests in the first group rotate the tokens.** Calling `setSession` again with the original pair therefore writes a jar built from a refresh token that has already been used, and `strongOwnerClient` refuses it. `seedCookieJar` does not throw, because `setSession` reports no error and the jar is not empty — so nothing points at the cause.
- Avoid: **one `beforeAll` per file**, with the groups nested inside it as plain `describe` blocks. Seeding per group looks tidier and buys nothing; the jar is module state and there is only ever one of it. `tests/cash-and-correction-routes.test.ts` was already written this way, which is why it never met this.
- Verify: 2026-08-12, found while writing `tests/notification-card-routes.test.ts`. The tell is the shape rather than the count: **a 403 on a test whose assertion is a 422 from zod** means the request never got past auth, so the boundary being exercised is not the one that failed. Restructuring to a single `beforeAll` took the file from 9 failed / 5 passed to 14 passed with no change to the route.

## pgTAP run straight after `pnpm test` fails in `001` on a foreign key, and the change is not the cause

- Symptom: `pnpm supabase:test` fails almost immediately with `insert or update on table "source_transactions" violates foreign key constraint "source_transactions_account_id_owner_id_fkey"` in `001_security.sql`, then `account not owned` in `002`, then `Bad plan` parse errors as later files run a fraction of their planned tests. It reads as a migration having broken the seed. It has not.
- Cause: the Vitest suites are owner-scoped rather than test-scoped — `resetOwnerImportSurface` deletes the owner's **accounts** in teardown, including the ones the synthetic seed created. pgTAP's fixtures insert rows against those seeded accounts, so every file that needs one fails on a foreign key against a row `pnpm test` removed twenty seconds earlier.
- Avoid: run `pnpm supabase:reset` **between** `pnpm test` and `pnpm supabase:test`, which is exactly where `docs/LOCAL_DEV.md` puts it. That position is not tidiness and it is not the same reset a new migration needs: a new migration means resetting *before* `pnpm test` as well, so a run with a new migration resets **twice**.
- Verify: 2026-08-14, during the migration 017 gate. Read the *first* failing file rather than the count — `001` failing on a foreign key while the newest file passes in isolation is the signature of a missing reset, not of a broken change. Running the new file alone and watching it pass is the cheapest confirmation.

## A PowerShell `**` path glob does not recurse, so the build's target check silently under-counts

- Symptom: the `.next` resting-state check reads **three** chunks carrying the synthetic project's port where every previous run recorded four. Nothing errors. The safety-relevant halves — zero chunks carrying the hosted ref, zero carrying the historical live port — read correctly, so the artifact looks *almost* right and the missing chunk reads as a build that changed rather than a search that missed.
- Cause: `Select-String -Path .next\server\**\*.js` treats `**` as a single-level wildcard. It matches `.next/server/chunks/*.js` and stops; `.next/server/chunks/ssr/*.js` is one level deeper and is never opened. The count is therefore a function of how the bundler happened to nest the chunks, not of what the build targets.
- Avoid: enumerate the files first and pipe them in — `Get-ChildItem -Path .next\server -Recurse -Filter *.js -File | Select-String -Pattern … -List`. Print the file count alongside the match count, so a search that scanned the wrong tree is visible rather than inferred: 147 files scanned is a plausible `.next/server`, and a number far below that is the tell.
- Verify: 2026-08-13, during the D-102 gate. The glob reported 3 and the recursive enumeration reported 4, from the same build, with the fourth match in `.next/server/chunks/ssr/`. **The failure direction is the dangerous one**: this check exists to prove no chunk carries the hosted project, and a search that quietly skips a directory would report zero for a chunk it never opened. Read the file count, not only the match count.

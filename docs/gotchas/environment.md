# Private Ledger gotchas — Environment, shell and toolchain

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **19 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


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

## Editing `pnpm-workspace.yaml` makes every `pnpm <script>` want to purge `node_modules`

- Symptom: `pnpm typecheck` — or any other script — exits without running anything, reporting `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, "Aborted removal of modules directory due to no TTY". Nothing about the message names the file that was edited, and the obvious reading is that the install is broken.
- Cause: two things compounding. pnpm runs a dependency-status check before every script, and it hashes the **workspace configuration** as well as the lockfile — so removing one line from `pnpm-workspace.yaml` makes it decide `node_modules` is stale and shell out to `pnpm install`. That install then meets the `ERR_PNPM_UNEXPECTED_STORE` condition above (this project's `node_modules` is linked from `.pnpm-store` while pnpm defaults to `D:\.pnpm-store`), so it wants to re-link everything, which means purging the directory first — and a non-interactive shell cannot confirm it, so it aborts.
- Avoid: run the tool directly rather than through pnpm when only the config moved — `node_modules/.bin/tsc --noEmit`, `node_modules/.bin/eslint .`, `node_modules/.bin/vitest run`. The deps-status check is what is in the way, not the tool. `--store-dir ".pnpm-store"` fixes the *store* half and does not stop the check itself from firing, so it is not the whole answer. A deliberate `pnpm install --frozen-lockfile --offline --store-dir ".pnpm-store"` is the other way, and it is the one to take once the change is settled rather than mid-edit.
- The generalisation: an agent that meets a purge prompt in a non-interactive shell must not reach for the flag that silences it. `confirmModulesPurge=false` turns an abort into a silent deletion of a working offline install, which on this machine is expensive to rebuild.
- Verify: 2026-08-18 (D-129). Removing the `tesseract.js: false` entry from `allowBuilds` — one dead line, since the package was gone — made `pnpm typecheck` abort this way while `node_modules/.bin/tsc --noEmit` ran normally and reported the real state of the tree. **It also broke the browser suites**, whose `webServer.command` is `pnpm build && pnpm start`, and there the only symptom is `Process from config.webServer was not able to start. Exit code: 1` — which names neither pnpm nor the config file. `pnpm install --frozen-lockfile --offline --store-dir ".pnpm-store"` cleared it in under a second, reporting `Already up to date` and purging nothing.

## tesseract.js caches its language data into the process working directory

- **Retired to its generalisation on 2026-08-19.** tesseract.js went with the local OCR engine on 2026-08-18 (D-129), so the instance — multi-megabyte `.traineddata` files appearing untracked at the repository root after a harness run — cannot happen here again. The full symptom, cause and 2026-08-10 verification are in `git log`.
- What survives, and it binds any future harness for any library with a local cache: **a library caches relative to the process's working directory, not the module's.** Putting a harness under `.runtime/` protects nothing against that — what matters is where the process was *started*. Set the cache path explicitly, and check the root afterwards regardless, because a stray multi-megabyte binary there is exactly the sort of thing that ends up in a commit.
- Verify: 2026-08-19. `tesseract.js` appears in no `package.json` dependency block and `.traineddata` matches nothing under the repository root. The instance is unreachable; the generalisation above is what this entry is now for.

## A PowerShell `;` chain does not propagate exit codes, so a truncated log plus a later command's zero reads as a green suite

- Symptom: a chained run reports `[exited with code 0]` and the tail of its output shows a passing summary, while the suite in the middle of the chain actually failed 31 of 33 tests.
- Cause: two independent defects that compose into a false green. `A; B; C` runs every command regardless of outcome and the reported status is **C's**, so a failing suite followed by a passing `check-docs` exits 0. Separately, piping a reporter through `Select-Object -Last 12` keeps the summary line but discards the header above the name list — and in Playwright's list reporter that header is the only thing distinguishing `31 failed` from `31 skipped`. The surviving fragment reads as a short, healthy run.
- Avoid: capture `$LASTEXITCODE` immediately after the command that matters and print it (`cmd; Write-Output "EXIT: $LASTEXITCODE"`), and do not truncate a test reporter's tail — `Select-String -Pattern "passed|failed|skipped"` keeps the counts without cutting the label off them. When a suite's result will gate a commit, run it as its own command.
- Verify: 2026-08-29. A chained owner-suite run showed `2 passed` with exit 0; re-run alone it reported `31 failed / 2 passed` and `PLAYWRIGHT EXIT: 1`, every failure in `assertOnlyDisposableLedgerData` during setup (D-168).

## A scripted replacement's escape sequences survive one layer of quoting and not two, and land real newlines inside string literals

- Symptom: an asserting replacement script reports `ok, 3 edits applied`, and the next run fails to parse the edited file: `SyntaxError: Unterminated string constant`, pointing at a line that ends mid-string with the rest of the statement on the following line.
- Cause: writing a patch script through a heredoc puts the script's own escapes through two consumers — the shell's here-document and then the language's string parser. An intended literal backslash-`n` inside the *output* file needs to survive both; get the count wrong by one and it is consumed as an escape, so a real newline is written into the middle of a string literal in the target file. The replacement genuinely matched and genuinely wrote — the assertion on match count cannot see this, because the damage is in the *replacement* text rather than in the search.
- Avoid: **do not put escape sequences in generated code at all.** A blank `push("")` for a leading gap and one push per item removes the whole class; string concatenation removes the rest. Where an escape is unavoidable, build it from a source that cannot be re-consumed and re-read the written file — asserting the match count proves the search was right and says nothing about what was written. This is the standing rule about asserting a scripted replacement, extended: assert the *result parses*, not only that something was replaced.
- Verify: 2026-08-29. Two consecutive failures on the same anchor — an `expected 1 occurrence, got 0` where the search string's own `\n` had become a newline, then a shipped file whose `report.push("` ended a line — both cleared by rewriting the inserted lines with no escapes (D-168).

# Private Ledger gotchas

Last reviewed: 2026-07-31

Record only repeatable, non-obvious traps. Each item states the symptom, cause, prevention, and verification.

**What a date on a `Verify:` line means, and what a backfilled one does not.** An ordinary date is the day the trap was checked against a running system. A clause reading **`Dated <date> from <sha>`** is weaker and deliberately says so: it was recovered on 2026-08-10 from the commit that introduced the code the trap is about, so it marks when the trap became *true* rather than when it was last confirmed *still* true. Neither kind is a promise that the trap holds today — that is what makes the date worth having, since a trap whose date is months behind the code it names is the one to re-read first. A date was never invented for an entry whose evidence could not be found; those stay undated, which is honest and is what `--strict` will keep failing on.

**One hundred and seventy-six traps, and this file is now the index to them rather than the file that holds them** (D-149, 2026-08-25). They were grouped on 2026-08-09 into the sections below — eight then, nine since `app.md` split on 2026-08-27 — added to since, and their bodies moved into `docs/gotchas/` — one file per section — when this file breached its budget a second time. **The split was owed rather than chosen**: D-134 raised the budget once and said the next breach was owed a split along these exact section headings, not a third raise. Neither move changed anything inside a trap; `Last reviewed` above is deliberately unchanged, because reorganising a file is not reviewing what it claims. **The index below still lists every trap in every section**, which is what makes finding one cost a scan of this file and then exactly one open. `pnpm check:docs --strict` fails if the index and the bodies disagree.

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
- Editing `pnpm-workspace.yaml` makes every `pnpm <script>` want to purge `node_modules`
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
- Windows reserves the whole local Supabase port block, and every container still reports healthy
- A source-grep guard pinned to one spelling passes when the code is rewritten
- A guard narrows in meaning without failing, because the behaviour moved to a file it does not name
- A word-grep in a privacy guard fails on the sentence that documents the rule
- Stripping comments before a source grep also strips the `//` inside a URL literal
- Playwright's route glob treats `?` as a wildcard, so a path glob also matches its own sub-paths

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
- Every push to `main` is a production deployment, including a docs-only one
- A correction overlay's `kind` and `amount_minor` are one fact, and writing either alone violates a check
- A figure that is right and empty is not the same as a figure that works
- `jsonb_agg` of a `sum` is a nested aggregate and PostgreSQL refuses it outright
- A signed month-over-month delta inverts wherever the quantity is stored negative

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
- A misread separator hides the label, not just the value, and the field reads as "not printed"
- Enlarging an image for OCR moves every box, so the crops must come from the same image
- A measurement taken on slips does not govern cards, and this is the fourth time
- A reader tuned to one OCR engine's word boundaries fails silently on another's

### Real data, masking and privacy

- Never use real statements to develop the parser
- Mis-decoded text hides in the character classes a masker leaves alone
- A folder of statements may contain something that is not a statement
- A masking parser that fails open prints exactly what it was written to hide
- The masked page-line dump cannot see what the reader did, and reading it as if it could produced a whole wrong diagnosis
- A "value-free" probe leaks values when its allow-list assumes a flat structure
- A placeholder that looks like a real value reads as a failed autofill
- A value-free reporting rule guards the print, not the reuse hours later
- Running the harness config without naming a file re-runs every harness under `.runtime/`

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
- A size budget in lines reports green about a file nothing can read in one pass
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
- An assertion that a scrolled element sits near the viewport top measures the document's length, not the scroll
- A fixture whose identifiers match nothing sends the test down the fallback branch, and it passes there
- Next.js mounts an empty `role="alert"` of its own, so a page-wide alert count never reaches zero
- A fixture that renders a QR reaches the internet for its WebAssembly, so the slip specs need the network
- `pnpm supabase:test` exits non-zero on a passing run, so the exit code is not the result
- A pgTAP plan that undercounts reports every subtest passing, and fails anyway

### Layout, typography and accessibility

- A `role="status"` added to a static notice breaks every existing spec that looks one up by role
- A second `role="status"` in the shell makes every existing status assertion ambiguous
- An `aria-label` replaces a button's words rather than adding to them, and axe says nothing
- A control that disables itself takes the focus with it
- A token that inverts between colour schemes makes every hardcoded partner a latent failure
- The browser suite that covers the signed-in app is desktop-only, so phone width is unmeasured there
- A colour declared outside the stylesheet does not move when the stylesheet does
- An element selector cannot reset a property a class set, and the rule still reads as if it did
- A layout audit against a page that loads nothing measures the absence of the thing it was written for
- A descendant's accessible name joins its ancestor's, and axe reports no violation for it
- `display: block` on a flex item is blockified away, so it cannot break onto its own line
- A typeface's cap height, not its `font-size`, decides how big it looks
- A disclosure component that renders a `<p>` breaks the moment it is used inside one
- Wrapping existing children in a element to make them collapsible re-lays-out every viewport
- The phone stacked-table mode renders `attr(data-label)`, so a table without those attributes becomes unlabelled figures
- A colour that passes as a chart mark can still fail as text
- A pixel typeface applied to figures makes digits transposable
- A row hover cannot separate rows on a phone

### App, auth, routing and accessibility

- Strict production CSP can block the Next.js development runtime
- Signing in again at aal1 downgrades a shared Supabase cookie session
- Only one ledger owner can ever exist locally
- A guard keyed on `NODE_ENV` is unreachable in the build that must exercise it
- A leftover TOTP factor makes a later sign-in unable to reach aal2
- Creating a ledger account before the import is proven leaves one that cannot be removed
- Splitting one page into routes breaks specs whose subject has nothing to do with routing
- `readError` takes a parsed body, so handing it a `Response` silently shows the fallback
- A route test that stubs `globalThis.fetch` breaks the owner's own session lookup
- A `setx` variable does not reach a shell an already-running tool spawns
- `normalise` decomposes Thai `ำ`, so a label the source spells with one character is matched as two
- `array_length` of an empty array is NULL, so a count-the-duplicates check fires on an empty list
- A defect that only appears when a feature succeeds will not be in the gate
- Pre-filling one half of a two-signal cross-check leaves a check that agrees with itself
- Cloud Vision's output is not byte-identical between calls, so a harness card count is not a fixed number
- A source-grep test matches the comment that explains its own rule
- A `Proxy` over a `Request` throws on `headers` unless the target is the receiver
- A size bound checked after the body is read bounds nothing
- A `FileList` is a live view of its input, so resetting the input empties it mid-handler
- Shipped, tested code with no caller looks identical to code that does not exist
- A fix guarded on an intermediate stage dies silently when a later feature skips that stage
- State that marks a mode is only ever set, and the stale mode answers a later action
- A click handler's event arrives as the first optional parameter, so a default of `false` is silently `true`
- An announcement between components races the network refusal that makes anyone want it
- A development sign-in bypasses the component that owns session state, so that component never notices
- A guard written for "nothing loads until asked" becomes a defect the moment something does
- Under paging, a count scoped to the filter cannot decide whether the ledger is empty
- A dedup downstream of paging hides a page that repeats a row, but not one that skips
- A per-account balance walk is exact under paging; the merged one across accounts is not
- A control with no class inherits the prose around it, and a suite that asks whether it exists cannot see that
- A period-over-period comparison is nonsense unless both periods are whole
- Reading a figure off a screenshot in a pixel typeface is not evidence

## Traps

**The bodies live in `docs/gotchas/`, one file per section, as of 2026-08-25 (D-149).** The
index above is unchanged and still covers every trap in every section — it is the way in, and a
reader who finds a title there opens exactly one file to read it. The split was owed rather than
chosen: D-134 raised this file's budget once and said the next breach was owed a split along
these section headings rather than a third raise. The owner chose the split.

| Section | Traps | File |
| --- | --- | --- |
| Environment, shell and toolchain | 19 | [`docs/gotchas/environment.md`](docs/gotchas/environment.md) |
| Docker and the local Supabase projects | 15 | [`docs/gotchas/docker-supabase.md`](docs/gotchas/docker-supabase.md) |
| Database, migrations and pgTAP | 17 | [`docs/gotchas/database.md`](docs/gotchas/database.md) |
| Backup, restore and recovery | 10 | [`docs/gotchas/recovery.md`](docs/gotchas/recovery.md) |
| Statement and slip parsing | 17 | [`docs/gotchas/parsing.md`](docs/gotchas/parsing.md) |
| Real data, masking and privacy | 8 | [`docs/gotchas/privacy.md`](docs/gotchas/privacy.md) |
| Tests, Playwright and the gate | 29 | [`docs/gotchas/tests.md`](docs/gotchas/tests.md) |
| App, auth, routing and accessibility | 41 | [`docs/gotchas/app.md`](docs/gotchas/app.md) |
| Layout, typography and accessibility | 18 | [`docs/gotchas/appearance.md`](docs/gotchas/appearance.md) |


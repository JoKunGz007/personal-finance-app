# Private Ledger gotchas — Statement and slip parsing

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **17 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


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
- **The second half of the same lesson, inherited on 2026-08-19 from a trap retired with tesseract.js** (D-129): a library that **composes** an asset name at runtime — from a directory plus feature detection, rather than being told the file — keeps a second, invisible copy of your build's file list. tesseract.js did that with `corePath` and asked for a 3.9 MB single-file variant the copy script never produced, 404ing on a name that appeared nowhere in the repository. **Name the exact file, or make a test compare the two lists.** A path given as a directory is a decision handed to the library; a path ending in the file name is one the build still owns.
- Verify: 2026-07-30. Five owner-session specs failed with the form never rendering, and passed once `locateFile` pointed at `/zxing_reader.wasm`. `public/zxing_reader.wasm` is gitignored and present after any `pnpm build`.

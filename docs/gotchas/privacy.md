# Private Ledger gotchas — Real data, masking and privacy

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **8 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


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

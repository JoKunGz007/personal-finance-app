# Synthetic fixture policy

All committed examples are invented. Names, references, dates, amounts, balances, account suffixes, Thai labels, branch names, and PDF geometry must be generated independently.

Never copy, redact, perturb, translate, hash, summarize, screenshot, or snapshot any real statement content into a fixture. A transformed real value remains real financial data. Test failures must not print full rows or decrypted backups.

`private-statements/` is ignored, outside automated discovery, and never read by agents or tests. A real Krungthai PDF may be used only for the final local smoke test after renewed explicit approval; its password is entered interactively and neither value is logged.

## Masked structural dumps

Amended 2026-07-25 (DECISIONS D-035). This is the one exception to the paragraph above, and it is narrow.

An agent may **invoke** `scripts/mask-statement.mjs` against a file *or a directory* under `private-statements/`, and may read the masked dumps it writes to `masked-dumps/`. An agent may not open, list, copy, or read anything under `private-statements/` itself.

**File names are masked too**, which is why directory mode exists. A statement's name routinely carries the account number or the holder's name, so a dump records its source as `xxxx_dddddddddd_dddddd.pdf` — enough to tell dumps apart and to show the naming pattern, carrying no value. Nobody has to type or read a real name, and the no-listing rule holds without costing anyone convenience.

The harness runs on the owner's machine, opens the PDF in its own process, and emits only what the on-device diagnostics already produce — masked shapes (`dd/dd/dd`), coordinates, and digit-free label wordings. No amount, balance, date, or account number can be in a dump: every numeral is destroyed before anything is written. The document password is read from stdin only, never from a chat message, a repo file, an environment variable, or a command-line argument, and is needed once per file.

One residual, stated plainly rather than rounded down to zero: **label wordings are printed unmasked**, because a wording is what they exist to reveal. Structure keeps values out of them — a run carrying a digit is dropped, so is one over 24 characters, and a label qualifies only when the run to its right is a number, which excludes an account holder's name. What survives on a known layout is boilerplate (`Statement Period`, `Total Deposit`, the transaction-type vocabulary). On an unfamiliar layout — a receipt especially — short digit-free text printed left of a number could be a merchant or recipient name. Read a dump's last section before handing it on; the harness prints that reminder when it finishes.

A dump is **not a fixture**. It describes a real document, so:

- `masked-dumps/` is gitignored, and no dump — or any part of one — is ever committed.
- Fixture geometry, label wordings, and coordinates stay invented. Do not transcribe a dump's numbers into a fixture, and do not tune a fixture until it matches one. A dump tells you *which structural facts a reader must handle*; the fixture that proves the reader is then written independently.
- A dump is working material for one layout, deleted once that layout reads.

Once folder access exists, "no values reach the agent" rests on this policy rather than on structure. Treat any direct read of `private-statements/` as a policy breach to report, not a shortcut to take.

## Shared working copies

Amended 2026-07-28 (DECISIONS D-049). The owner has granted agents read access to real statements, under one condition and in one place.

`private-statements/` **is unchanged and remains closed.** Its files are the originals, and their password is derived from the owner's date of birth and citizen ID — identity-grade, non-rotatable, and worth more than the documents it protects. Nothing here reopens it.

What is open is `shared-statements/`: copies produced by `scripts/repassword-pdfs.py copy --decrypt`. An agent may read those files directly. The directory is gitignored.

The copies carry **no password at all**, and that is deliberate rather than a lapse. The protection happened upstream: the owner first rotated his own archive off the bank password with `archive` mode, so no file anywhere still opens with his date of birth and citizen ID. Encrypting the shared copies on top of that would have protected nothing from the agent — it would have to be handed the password to read them — while adding a decryption step to every read. The password that mattered is already gone; what is left is the document, which is what the owner agreed to share.

The owner's reasoning, recorded because a later reader will otherwise assume it was an oversight: the line items on a bank statement are not sensitive to him, and the header — name, account number, branch — is exposure he has explicitly accepted. That acceptance is his to give. It is also *specific*: it covers statement contents, not passwords, keys, `.env*`, backups, or the citizen ID itself.

**Masked dumps stay the first resort.** They are cheaper in every sense, and most reader work needs structure rather than values. Reach for a shared copy when a dump has actually proven insufficient — a layout that will not parse, a discrepancy that only the rendered page explains — not by default because it is now permitted.

Two rules survive this amendment intact, and they are the ones that matter:

- **No real value becomes a fixture, ever.** Reading a statement changes what an agent may *look at*; it changes nothing about what may be *written down*. Fixture geometry, wordings, amounts and dates stay invented. Do not transcribe, redact, perturb or round a value out of a shared copy into a test, a doc, or a commit. This is the rule the whole policy exists to protect, and widening read access makes it easier to break by accident.
- **Nothing from a shared copy is committed**, quoted into a continuity doc, or pasted into a transcript beyond what the work requires. Structural counts — rows, pages, columns — remain reportable. Amounts, balances, counterparties, account numbers and names do not.

Screenshots deserve their own line, because they defeat every one of these rules at once and are easy to reach for. Do not screenshot a rendered statement, and do not screenshot the app's review table, which shows descriptions and amounts.

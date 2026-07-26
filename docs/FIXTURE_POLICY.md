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

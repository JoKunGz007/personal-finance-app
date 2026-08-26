#!/usr/bin/env node
// Structural checks for the maintained continuity documents.
//
// Every failure this catches was made by hand at least once: a duplicate decision id,
// an index that drifted from its entries, a pointer naming a range that had moved on,
// a Cause line citing a file that a refactor had deleted. None of them are judgement
// calls, so none of them belong to a reader. Run from the repo root:
//
//   node scripts/check-docs.mjs            # structural failures are fatal, coverage gaps warn
//   node scripts/check-docs.mjs --strict    # warnings are fatal too
//
// Exit code 1 means a document contradicts the tree or itself.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

// A decision log outgrows a single read long before it outgrows a file. When the
// maintained half passes this, archive the oldest contiguous range (D-080).
//
// **Budgeted in bytes, not lines, and the correction is the whole point.** These files were
// budgeted at 1,200 and 1,400 lines from 2026-07 until 2026-08-18. `DECISIONS.md` passed that
// check at 1,132 lines while being **332 KB** — roughly 80,000 tokens, most of a context window
// for one file — because entries here are long prose paragraphs and the file grew sideways rather
// than downward. A line count says nothing about that. The guard existed to stop a log outgrowing
// a single read and was reporting green about a file nothing could read in one go.
//
// The numbers are set from what a read costs rather than from what the files happen to be: this
// project's Markdown runs about 0.33 tokens per byte, so 120 KB is ~40,000 tokens. `DECISIONS.md`
// is read front-to-back by anyone picking the project up, which is why it gets the tighter one;
// `GOTCHAS.md` is a lookup file entered through its index, so its size costs less per use and it
// is allowed more.
//
// **`GOTCHAS.md` was raised from 200 KB to 260 KB on 2026-08-19** (D-134), on the owner's decision
// and after the sanctioned remedy had been applied rather than instead of it: two dead traps were
// retired first and that moved 181 KB to 177 KB, which is the honest measure of what retirement can
// do. There is no archive for traps by design (see the remedy below), so retirement is the only
// lever and it is bounded by how many traps actually die — far fewer than are written.
//
// **The raise follows the lookup-file argument to its conclusion.** What a reader of this file
// actually pays is the **index plus one trap**, not the whole body; the index is about 10 KB of the
// 177. So the body is bounded by what keeps the file greppable rather than by what fits in one
// read, and 260 KB is ~86,000 tokens of body nobody reads front-to-back.
//
// **The condition attached to it, which is the point of writing this here.** The thing that must
// stay readable in one pass is the **index**. When the index stops being scannable, the answer is
// structural — splitting the file along its existing section headings, each with its own index —
// and **not** a third raise. A budget raised twice is a budget that has been abandoned.
//
// **That condition fired and was honoured on 2026-08-25** (D-149). The owner chose the split rather
// than a third raise, and the 149 trap bodies moved to `docs/gotchas/`, one file per section, with
// `GOTCHAS.md` keeping the index alone. So the 260 KB figure is retired rather than raised: it
// bounded a body nobody read front-to-back, and there is no longer a single body to bound. The two
// budgets below replace it and each measures something a reader actually pays.
//
// **The index gets the tight one**, because it is the only part read in full and its scannability
// was the whole condition. **Each section gets the loose one**, because a reader arrives through the
// index and opens exactly one — 80 KB is ~26,000 tokens, which is a section still readable in one
// pass. A section that breaches splits in two; there is still no archive for traps, by design.
const DECISIONS_BYTE_BUDGET = 120_000;
const GOTCHAS_INDEX_BYTE_BUDGET = 40_000;
const GOTCHAS_SECTION_BYTE_BUDGET = 80_000;

// A path is checkable when its first segment is a directory the repo actually owns.
// Anything else in backticks is a package-internal path, an external tool, or generated
// working material, and asserting on it would produce noise rather than findings.
const SOURCE_DIRS = ["app", "lib", "tests", "scripts", "supabase", "workers", "docs", "types"];

// Files that were deliberately removed or split. Naming one is not a defect — an
// append-only log and a plan that records what happened both have to say the old name,
// and rewriting them would be rewriting history. What this list buys is the opposite
// case: a path that died and nobody noticed fails the check until it is either fixed
// in the docs or recorded here with its successor.
const RETIRED_PATHS = {
  "app/ledger-app.tsx": "split into app/import-bench.tsx and app/recovery-bench.tsx (D-061)",
  // The local OCR engine and everything that existed only for it. Deleted when slip capture
  // adopted Cloud Vision, which took its last caller with it (D-129).
  "lib/slip-ocr-engine.ts": "deleted with the local OCR engine; lib/vision-ocr.ts is the only engine now (D-129)",
  "tests/slip-ocr-engine.test.ts": "deleted with lib/slip-ocr-engine.ts (D-129)",
  "scripts/copy-tesseract-assets.mjs": "deleted with the local OCR engine and its prebuild step (D-129)",
  // Renamed rather than deleted: the reader stopped being the card's when the slip form became
  // its second caller, and a path naming one record type is what gets reasoned from later.
  "app/api/v1/notification-cards/read/route.ts": "moved to app/api/v1/ocr/read/route.ts (D-129)",
  "lib/notification-card-vision.ts": "renamed to lib/vision-ocr.ts (D-129)",
  "tests/notification-card-vision.test.ts": "renamed to tests/vision-ocr.test.ts (D-129)",
};

const failures = [];
const warnings = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

const read = (rel) => readFileSync(join(ROOT, rel), "utf8").split(/\r?\n/);
const has = (rel) => existsSync(join(ROOT, rel));

const DECISIONS = "DECISIONS.md";
const GOTCHAS = "GOTCHAS.md";
const CONTINUITY = [DECISIONS, GOTCHAS, "SPEC.md", "PLAN.md", "HANDOFF.md"];

// **The traps live in `docs/gotchas/`, one file per section, since 2026-08-25** (D-149). `GOTCHAS.md`
// keeps the index and nothing else, so every check below that used to read one file now reads these
// and treats them as one document. Ordered by name so a run reports the same way twice.
function gotchaFiles() {
  const dir = join(ROOT, "docs", "gotchas");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => `docs/gotchas/${f}`);
}

function archiveFiles() {
  const dir = join(ROOT, "docs", "decisions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/decisions/${f}`);
}

const headings = (lines, prefix = "## ") =>
  lines
    .map((l, i) => ({ line: l, n: i + 1 }))
    .filter((x) => x.line.startsWith(prefix))
    .map((x) => ({ text: x.line.slice(prefix.length).trim(), n: x.n }));

// ---------------------------------------------------------------- decision ids

const decisionEntries = [];
for (const file of [DECISIONS, ...archiveFiles()]) {
  for (const h of headings(read(file))) {
    const m = /^(D-(\d{3}))\s+[—-]\s+(.+)$/.exec(h.text);
    if (m) decisionEntries.push({ id: m[1], num: Number(m[2]), title: m[3], file, n: h.n });
  }
}

if (decisionEntries.length === 0) fail(DECISIONS, "no decision entries found — heading format changed?");

const byId = new Map();
for (const e of decisionEntries) {
  if (byId.has(e.id)) {
    const first = byId.get(e.id);
    fail(DECISIONS, `${e.id} is used twice — ${first.file}:${first.n} and ${e.file}:${e.n}`);
  } else byId.set(e.id, e);
}

const nums = decisionEntries.map((e) => e.num).sort((a, b) => a - b);
if (nums.length) {
  const missing = [];
  for (let i = nums[0]; i <= nums[nums.length - 1]; i++) if (!nums.includes(i)) missing.push(i);
  const pad = (n) => `D-${String(n).padStart(3, "0")}`;
  if (missing.length) fail(DECISIONS, `gap in the sequence: ${missing.map(pad).join(", ")}`);
  if (nums[0] !== 1) fail(DECISIONS, `sequence starts at D-${String(nums[0]).padStart(3, "0")}, expected D-001`);
}

// ------------------------------------------------------------------- indexes

// The index is the only cheap way to learn what a long log contains, so it is worth
// nothing unless it matches the entries one for one. Generate it; never hand-edit it.
function checkIndex(file, expected, { label }) {
  const lines = read(file);
  const start = lines.findIndex((l) => /^## Index\s*$/.test(l));
  if (start === -1) {
    fail(file, "no '## Index' section");
    return;
  }
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const region = lines.slice(start + 1, end === -1 ? lines.length : end);
  const listed = region
    .filter((l) => /^- /.test(l))
    .map((l) => l.slice(2).replace(/\s*\*\(superseded by D-\d{3}\)\*\s*$/, "").trim());

  if (listed.length !== expected.length) {
    fail(file, `index lists ${listed.length} ${label}, the file holds ${expected.length}`);
  }
  const missing = expected.filter((t) => !listed.includes(t));
  const extra = listed.filter((t) => !expected.includes(t));
  for (const t of missing.slice(0, 5)) fail(file, `not in the index: ${t.slice(0, 70)}`);
  for (const t of extra.slice(0, 5)) fail(file, `index names something absent: ${t.slice(0, 70)}`);
}

checkIndex(
  DECISIONS,
  decisionEntries.sort((a, b) => a.num - b.num).map((e) => `**${e.id}** — ${e.title}`),
  { label: "decisions" },
);

// Gathered across every section file rather than out of `GOTCHAS.md`, which now holds the index
// alone. The index is still checked against the bodies one for one — that is the property the split
// had to preserve, since an index is worth nothing if it can drift from what it claims to cover.
const gotchaTitles = gotchaFiles()
  .flatMap((f) => headings(read(f)).map((h) => h.text))
  .filter((t) => t !== "Index" && t !== "Traps");
checkIndex(GOTCHAS, gotchaTitles, { label: "traps" });

// ------------------------------------------------------- dangling references

const knownIds = new Set(decisionEntries.map((e) => e.id));
for (const file of [...CONTINUITY, ...archiveFiles(), "AGENTS.md", "CLAUDE.md", "README.md"]) {
  if (!has(file)) continue;
  const text = read(file).join("\n");
  const cited = new Set(text.match(/\bD-\d{3}\b/g) ?? []);
  for (const id of cited) {
    if (!knownIds.has(id)) fail(file, `cites ${id}, which has no entry`);
  }
}

// ------------------------------------------------------------ paths and links

const pathRe = /`([A-Za-z0-9_@./-]+\.(?:ts|tsx|mjs|js|sql|json|yaml|yml|py|md|css|wasm))`/g;
const linkRe = /\[[^\]]*\]\(([^)#:]+\.md)(?:#[^)]*)?\)/g;

for (const file of [...CONTINUITY, ...archiveFiles(), "AGENTS.md", "CLAUDE.md", "README.md"]) {
  if (!has(file)) continue;
  const text = read(file).join("\n");

  for (const m of text.matchAll(pathRe)) {
    const p = m[1];
    if (!SOURCE_DIRS.includes(p.split("/")[0])) continue; // not a path this repo owns
    if (p in RETIRED_PATHS || has(p)) continue;
    fail(file, `names \`${p}\`, which is not in the tree and is not a recorded retirement`);
  }

  for (const m of text.matchAll(linkRe)) {
    const target = m[1];
    if (/^https?:/.test(target)) continue;
    const resolved = join(dirname(join(ROOT, file)), target);
    if (!existsSync(resolved)) fail(file, `links to ${target}, which does not exist`);
  }
}

// A retirement that came back is a stale exemption, and a stale exemption is how a
// check quietly stops checking (GOTCHAS: a source-grep test keeps passing after the
// thing it names becomes false).
for (const [p, note] of Object.entries(RETIRED_PATHS)) {
  if (has(p)) fail("scripts/check-docs.mjs", `\`${p}\` is recorded as retired (${note}) but exists`);
}

// ---------------------------------------------------------------- size budget

// Different files, different remedies, and saying so is the point of not sharing one message.
// There is no archive for traps: a trap whose subject is gone gets a dated "no longer live" line
// and keeps whatever generalisation outlived it. Relocating them would only move the reading cost.
// **`GOTCHAS.md` is an index now and is budgeted as one** (D-149). The split D-134 owed was
// performed on 2026-08-25, so the old 260 KB figure no longer describes anything: what it was
// protecting — a file nobody could read in one pass — is now eight files, and the cost that
// matters is per section, since a reader arrives through the index and opens exactly one.
const BUDGETS = [
  [DECISIONS, DECISIONS_BYTE_BUDGET,
    "archive the oldest contiguous range into docs/decisions/ (D-080), then move its index bullets to the Archived section"],
  [GOTCHAS, GOTCHAS_INDEX_BYTE_BUDGET,
    "this file is the index alone — if it has grown past that, prose has crept back in and belongs in a section file"],
  ...gotchaFiles().map((f) => [f, GOTCHAS_SECTION_BYTE_BUDGET,
    "retire traps whose subject no longer exists, keeping the generalisation that outlived them — " +
    "and if that is not enough, split this section in two and give both halves an index entry (D-149)"])
];

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

for (const [file, budget, remedy] of BUDGETS) {
  // Byte length, not `String.length`: this project's documents are full of em dashes, Thai labels
  // and typographic quotes, every one of which is several bytes and one character. Measuring
  // characters would under-report the files most at risk of being unreadable in one pass.
  const bytes = Buffer.byteLength(readFileSync(join(ROOT, file), "utf8"), "utf8");
  if (bytes > budget) {
    fail(file, `${kb(bytes)} exceeds the ${kb(budget)} budget — ${remedy}`);
  }
}

// -------------------------------------------------- gotcha verification dates

// A trap is stale when what it warns about changes, which no position in the file
// predicts. The only queryable proxy is the date on its own Verify line.
{
  let undated = 0;
  let total = 0;
  // Per file, because a trap's block ends at the next heading **in its own file** — running the
  // scan over a concatenation would let the last trap of one section swallow the next section's
  // header and borrow its date.
  for (const file of gotchaFiles()) {
    const lines = read(file);
    const heads = headings(lines).filter((h) => h.text !== "Index" && h.text !== "Traps");
    total += heads.length;
    for (let i = 0; i < heads.length; i++) {
      const from = heads[i].n;
      const to = i + 1 < heads.length ? heads[i + 1].n - 1 : lines.length;
      const block = lines.slice(from, to).join("\n");
      const verify = /^- (?:\*\*)?Verif/m.test(block);
      if (!verify) {
        fail(file, `"${heads[i].text.slice(0, 60)}" has no Verify line`);
      } else if (!/\b20\d\d-\d\d-\d\d\b/.test(block)) {
        undated++;
      }
    }
  }
  if (undated) {
    warn(GOTCHAS, `${undated} of ${total} traps carry no date, so their staleness cannot be queried`);
  }
}

// ---------------------------------------------------------------------- report

const label = (xs, kind) => `${xs.length} ${kind}${xs.length === 1 ? "" : "s"}`;
if (warnings.length) {
  console.log(`warnings (${label(warnings, "item")}):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (failures.length) {
  console.error(`\ndocs check FAILED — ${label(failures, "problem")}:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// The sizes are printed on a passing run, not only on a failing one. A budget nobody sees the
// approach to is a budget that is only ever met as a surprise — and the whole reason this check
// changed on 2026-08-18 is that its predecessor reported green all the way to 332 KB.
console.log(
  `docs check passed: ${decisionEntries.length} decisions, ${gotchaTitles.length} traps, ` +
    `indexes match, references and paths resolve.`,
);
console.log(
  "  sizes: " +
    BUDGETS.map(([file, budget]) => {
      const bytes = Buffer.byteLength(readFileSync(join(ROOT, file), "utf8"), "utf8");
      return `${file} ${kb(bytes)}/${kb(budget)} (${Math.round((bytes / budget) * 100)}%)`;
    }).join(", "),
);
if (STRICT && warnings.length) {
  console.error("\n--strict: warnings are fatal.");
  process.exit(1);
}

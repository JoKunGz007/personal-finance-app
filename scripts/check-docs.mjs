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
const DECISIONS_LINE_BUDGET = 1200;
const GOTCHAS_LINE_BUDGET = 1400;

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

const gotchaTitles = headings(read(GOTCHAS))
  .map((h) => h.text)
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

for (const [file, budget] of [[DECISIONS, DECISIONS_LINE_BUDGET], [GOTCHAS, GOTCHAS_LINE_BUDGET]]) {
  const n = read(file).length;
  if (n > budget) {
    fail(file, `${n} lines exceeds the ${budget}-line budget — archive the oldest contiguous range (D-080)`);
  }
}

// -------------------------------------------------- gotcha verification dates

// A trap is stale when what it warns about changes, which no position in the file
// predicts. The only queryable proxy is the date on its own Verify line.
{
  const lines = read(GOTCHAS);
  const heads = headings(lines).filter((h) => h.text !== "Index" && h.text !== "Traps");
  let undated = 0;
  for (let i = 0; i < heads.length; i++) {
    const from = heads[i].n;
    const to = i + 1 < heads.length ? heads[i + 1].n - 1 : lines.length;
    const block = lines.slice(from, to).join("\n");
    const verify = /^- (?:\*\*)?Verif/m.test(block);
    if (!verify) {
      fail(GOTCHAS, `"${heads[i].text.slice(0, 60)}" has no Verify line`);
    } else if (!/\b20\d\d-\d\d-\d\d\b/.test(block)) {
      undated++;
    }
  }
  if (undated) {
    warn(GOTCHAS, `${undated} of ${heads.length} traps carry no date, so their staleness cannot be queried`);
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

console.log(
  `docs check passed: ${decisionEntries.length} decisions, ${gotchaTitles.length} traps, ` +
    `indexes match, references and paths resolve.`,
);
if (STRICT && warnings.length) {
  console.error("\n--strict: warnings are fatal.");
  process.exit(1);
}

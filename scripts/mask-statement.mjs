// Masking harness — the only sanctioned way a private statement informs a layout.
//
// Reads one PDF on this machine and writes a structural dump to `masked-dumps/`, which
// is gitignored. The document's bytes and page text never leave this process: what is
// written is only what `lib/masked-diagnostics.ts` emits — masked shapes (`dd/dd/dd`),
// coordinates, and digit-free label wordings.
//
// The label wordings are the one part printed unmasked, because a wording is what they
// exist to reveal. No value can reach them (anything with a digit is dropped, as is
// anything over 24 characters, and a label whose value is text never qualifies), but on
// an unfamiliar layout short digit-free text left of a number need not be boilerplate —
// on a receipt it could be a merchant or recipient name. The dump says so where it
// prints them, and so does this script when it finishes.
//
// Boundary (DECISIONS D-035, docs/FIXTURE_POLICY.md § Masked structural dumps): an agent
// may *invoke* this against a file under `private-statements/` and may read the dump. An
// agent may not read the PDF. A dump is working material, not a fixture — never commit
// one, and never transcribe its numbers into a fixture.
//
// Usage, from the repo root with the project-local Node 24 on PATH:
//
//   node scripts/mask-statement.mjs private-statements/<file>.pdf --label scb
//
// The password is read from stdin, never from an argument: an argument is visible to
// every process on this machine and lands in shell history, and these passwords are
// identity-grade and non-rotatable. Piping works too (`... < pw.txt`), but typing it is
// better — nothing then touches the disk. Pass `--no-password` for an unprotected file.
//
// pdfjs-dist's `legacy` build is the one that runs under Node; the default build assumes
// a browser. No worker is configured, so pdf.js runs the whole parse in this process
// (`useWorkerFetch: false`) rather than trying to spawn one it cannot reach.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename, join, resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  describeLabelGeometry, describeStructure, describeValueLabels
} from "../lib/masked-diagnostics.ts";

const DUMP_DIR = "masked-dumps";

function fail(message) {
  process.stderr.write(`mask-statement: ${message}\n`);
  process.exit(1);
}

function parseArguments(argv) {
  const positional = [];
  let label = null;
  let withPassword = true;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--label") {
      label = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--no-password") {
      withPassword = false;
    } else if (argument.startsWith("--")) {
      fail(`unknown option ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  if (positional.length !== 1) fail("expected exactly one PDF path");
  // A password can only arrive by stdin. Refuse anything that looks like one on the
  // command line rather than silently accepting it, since by then it is already in the
  // process table and the shell history.
  return { pdfPath: positional[0], label, withPassword };
}

// Reads one line from stdin without echoing it. Node's readline has no built-in silent
// mode: muting is done by intercepting the output stream's writes while the prompt is
// open, which works on a TTY and is simply a no-op when stdin is a pipe.
async function readPassword(prompt) {
  if (!process.stdin.isTTY) {
    const piped = await new Promise((resolvePiped) => {
      let buffer = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { buffer += chunk; });
      process.stdin.on("end", () => resolvePiped(buffer));
    });
    return piped.split(/\r?\n/u)[0] ?? "";
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let muted = false;
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, encoding, callback) =>
    muted ? (typeof callback === "function" ? callback() : true) : write(chunk, encoding, callback);
  try {
    const answer = await new Promise((resolveAnswer) => {
      rl.question(prompt, resolveAnswer);
      muted = true;
    });
    return answer;
  } finally {
    muted = false;
    process.stdout.write = write;
    write("\n");
    rl.close();
  }
}

async function extractPages(bytes, password) {
  const document = await getDocument({
    data: bytes,
    password,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false
  }).promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      // pdf.js transform is [a, b, c, d, e, f]; e and f are the device x and y. The run's
      // width matters as much as its x, because money and branch columns are right
      // aligned and a left edge alone cannot say which column a run belongs to (D-030).
      const [, , , , x, y] = item.transform;
      items.push({ str: item.str.normalize("NFKC"), x, y, width: item.width });
    }
    pages.push(items);
  }
  return { pages, pageCount: document.numPages };
}

function renderDump({ label, pageCount, pages }) {
  const structure = describeStructure(pages);
  const labelGeometry = describeLabelGeometry(pages);
  const valueLabels = describeValueLabels(pages);

  return [
    `# Masked structural dump — ${label}`,
    "",
    "Value-free. Every numeral is `d` and every letter or combining mark is `x`; only",
    "punctuation, spacing, and coordinates survive. Produced by scripts/mask-statement.mjs.",
    "",
    "NOT A FIXTURE. This describes a real document (DECISIONS D-035). Never commit it, and",
    "never transcribe its coordinates or label wordings into a fixture — read it to learn",
    "which structural facts a reader must handle, then write the fixture independently.",
    "",
    `Pages: ${pageCount}`,
    `Runs: ${pages.reduce((total, page) => total + page.length, 0)}`,
    "",
    "## Structure",
    "",
    "`p<page> y=<row>  <shape>@<x>  <shape>@<x> …` — page one in full, later pages by their",
    "opening lines, and the last page in full because a summary block lives there.",
    "",
    ...structure,
    "",
    "## Dense label lines",
    "",
    "Lines of at least three short digit-free items — heading rows are dense, address and",
    "name lines are not. These are the candidate column headings.",
    "",
    ...labelGeometry.map((line) => `- ${line.join(" | ")}`),
    "",
    "## Labels printed immediately left of a digit",
    "",
    "First and last page only. This is the label/value shape the frame fields and the",
    "summary totals use, so these are the candidate frame and summary wordings.",
    "",
    "**This is the one section printed unmasked**, because a wording is exactly what it",
    "exists to reveal. A value cannot appear here — anything carrying a digit or longer",
    "than 24 characters is dropped, and a label whose value is text (an account holder's",
    "name) never qualifies. What *could* appear is short digit-free text that is printed",
    "left of a number and is not boilerplate: on a receipt, a merchant or recipient name.",
    "Glance at this list before handing the dump to anyone.",
    "",
    ...valueLabels.map((label_) => `- ${label_}`),
    ""
  ].join("\n");
}

async function main() {
  const { pdfPath, label, withPassword } = parseArguments(process.argv.slice(2));
  const absolute = resolve(process.cwd(), pdfPath);
  const slug = (label ?? basename(pdfPath).replace(/\.pdf$/iu, ""))
    .toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (!slug) fail("could not derive a dump name; pass --label");

  let bytes;
  try {
    bytes = new Uint8Array(await readFile(absolute));
  } catch {
    // The path, not the error: an fs error message can echo back the file name in full.
    fail(`could not read ${pdfPath}`);
  }

  let password = "";
  if (withPassword) {
    password = await readPassword("Document password (not echoed, never stored): ");
    if (!password) fail("no password given; pass --no-password for an unprotected file");
  }

  let extracted;
  try {
    extracted = await extractPages(bytes, password);
  } catch (error) {
    // The error's class name only. pdf.js names are library constants
    // (PasswordException, InvalidPDFException, …) and distinguish a wrong password from
    // a broken file without carrying anything read out of the document.
    const name = error instanceof Error ? error.name : "UnknownError";
    fail(name === "PasswordException" ? "the password is incorrect" : `pdf.js refused the file (${name})`);
  } finally {
    password = "";
    bytes = null;
  }

  const dump = renderDump({ label: slug, ...extracted });
  await mkdir(DUMP_DIR, { recursive: true });
  const outputPath = join(DUMP_DIR, `${slug}.md`);
  await writeFile(outputPath, dump, "utf8");
  process.stdout.write(
    `Wrote ${outputPath} — ${extracted.pageCount} pages, masked.\n` +
    "Read its last section before sharing: label wordings are printed unmasked by design,\n" +
    "and on an unfamiliar layout a short name printed left of a number can land there.\n"
  );
}

await main();

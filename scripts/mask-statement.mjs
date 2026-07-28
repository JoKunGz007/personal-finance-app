// Masking harness — the only sanctioned way a private statement informs a layout.
//
// Reads one PDF, or every PDF under a directory, on this machine and writes a structural
// dump per file to `masked-dumps/`, which is gitignored. The documents' bytes and page
// text never leave this process: what is written is only what `lib/masked-diagnostics.ts`
// emits — masked shapes (`dd/dd/dd`), coordinates, and digit-free label wordings.
//
// The label wordings are the one part printed unmasked, because a wording is what they
// exist to reveal. No value can reach them (anything with a digit is dropped, as is
// anything over 24 characters, and a label whose value is text never qualifies), but on
// an unfamiliar layout short digit-free text left of a number need not be boilerplate —
// on a receipt it could be a merchant or recipient name. The dump says so where it
// prints them, and so does this script when it finishes.
//
// **File names are masked too.** A statement's name routinely carries the account number
// or the holder's name, so a dump records its source as `xxxx_dddddddddd_dddddd.pdf` —
// enough to tell one dump from another and to show the naming pattern, carrying nothing.
// This is why directory mode exists: nobody has to type or read a real file name.
//
// Boundary (DECISIONS D-035, docs/FIXTURE_POLICY.md § Masked structural dumps): an agent
// may *invoke* this against `private-statements/` and may read the dumps. An agent may
// not read the PDFs, and may not list that directory. A dump is working material, not a
// fixture — never commit one, and never transcribe its numbers into a fixture.
//
// Usage, from the repo root with the project-local Node 24 on PATH:
//
//   node scripts/mask-statement.mjs private-statements/scb --label scb
//   node scripts/mask-statement.mjs private-statements/one.pdf --label scb
//
// The password is read from stdin, never from an argument or an environment variable. An
// argument is visible to every process on this machine and lands in shell history; an
// environment variable outlives the run and is readable by every child process. These
// passwords are identity-grade and non-rotatable, so stdin — which exists only for the
// life of the prompt — is the only acceptable channel. It is asked for once and reused
// across the whole directory, and re-asked only for a file it does not open. Piping works
// (`… < pw.txt`), but typing it is better; nothing then touches the disk. Pass
// `--no-password` for unprotected files.
//
// pdfjs-dist's `legacy` build is the one that runs under Node; the default build assumes
// a browser. No worker is configured, so pdf.js runs the whole parse in this process
// (`useWorkerFetch: false`) rather than trying to spawn one it cannot reach.

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename, extname, join, relative, resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  describeLabelGeometry, describeStructure, describeValueLabels, maskShape
} from "../lib/masked-diagnostics.ts";

const DUMP_DIR = "masked-dumps";
const PASSWORD_ATTEMPTS = 3;

// Statements that reference the standard PDF fonts rather than embedding them make
// pdf.js warn about `standardFontDataUrl`. It is cosmetic here — extraction is driven by
// the encoding tables and demonstrably works without it, Thai included — but pointing
// pdf.js at the font data it already ships removes the doubt.
//
// A plain path, not a `file://` URL: Node's `fetch` does not support the file scheme, so
// a URL turns "not provided" into "unable to load" without improving anything. The
// legacy build reads this one from disk. Forward slashes and a trailing separator are
// what pdf.js concatenates a font name onto.
const STANDARD_FONTS = `${resolve("node_modules/pdfjs-dist/standard_fonts").replace(/\\/gu, "/")}/`;

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
  if (positional.length !== 1) fail("expected exactly one PDF or directory path");
  return { inputPath: positional[0], label, withPassword };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

// A file name reduced the same way a cell is: numerals to `d`, letters to `x`, everything
// else kept. `scb_1234567890_202601.pdf` becomes `xxx_dddddddddd_dddddd.pdf`. The
// extension is left intact — it is not a value, and it says what was actually read.
function maskName(name) {
  const extension = extname(name);
  return `${maskShape(name.slice(0, name.length - extension.length))}${extension.toLowerCase()}`;
}

// Every PDF under the path, sorted, so numbering is stable between runs. Sorted by real
// path but only ever reported masked.
async function collectPdfs(absolute) {
  const info = await stat(absolute);
  if (!info.isDirectory()) return [absolute];

  const found = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (extname(entry.name).toLowerCase() === ".pdf") found.push(child);
    }
  };
  await walk(absolute);
  return found.sort((left, right) => left.localeCompare(right));
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
    // PowerShell prepends a UTF-8 BOM when it pipes to a native command, so a piped
    // password arrives as "﻿…" and fails against a document that would have
    // opened. Stripping it is the difference between "wrong password" and correct.
    return (piped.split(/\r?\n/u)[0] ?? "").replace(/^﻿/u, "");
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
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONTS
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

function renderDump({ label, sourceName, pageCount, pages }) {
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
    `Source: ${sourceName} (masked — the real name may carry an account number or a name)`,
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

// Opens one document, asking again if the running password does not fit it. Returns the
// password that worked so the caller can adopt it for the rest — a folder usually shares
// one, and re-asking per file would defeat the point of directory mode.
async function openWithPassword(bytes, running, withPassword, maskedName) {
  let candidate = running;
  for (let attempt = 0; attempt < (withPassword ? PASSWORD_ATTEMPTS : 1); attempt += 1) {
    try {
      return { extracted: await extractPages(bytes, candidate), password: candidate };
    } catch (error) {
      // The error's class name only. pdf.js names are library constants
      // (PasswordException, InvalidPDFException, …) and distinguish a wrong password
      // from a broken file without carrying anything read out of the document.
      const name = error instanceof Error ? error.name : "UnknownError";
      if (name !== "PasswordException" || !withPassword) {
        return { error: name === "PasswordException" ? "the password is incorrect" : `pdf.js refused it (${name})` };
      }
      if (attempt === PASSWORD_ATTEMPTS - 1) return { error: "the password is incorrect" };
      candidate = await readPassword(`Password for ${maskedName} (not echoed, never stored): `);
      if (!candidate) return { error: "no password given" };
    }
  }
  return { error: "the password is incorrect" };
}

async function main() {
  const { inputPath, label, withPassword } = parseArguments(process.argv.slice(2));
  const absolute = resolve(process.cwd(), inputPath);

  let files;
  try {
    files = await collectPdfs(absolute);
  } catch {
    // The path as given, not the fs error, which can echo a full name back.
    fail(`could not read ${inputPath}`);
  }
  if (files.length === 0) fail(`no PDF found under ${inputPath}`);

  const prefix = slugify(label ?? basename(inputPath).replace(/\.pdf$/iu, ""));
  if (!prefix) fail("could not derive a dump name; pass --label");

  let password = "";
  if (withPassword) {
    password = await readPassword(
      files.length === 1
        ? "Document password (not echoed, never stored): "
        : `Password for ${files.length} documents (not echoed, never stored; asked again only if one differs): `
    );
    if (!password) fail("no password given; pass --no-password for unprotected files");
  }

  await mkdir(DUMP_DIR, { recursive: true });
  const failures = [];
  let written = 0;

  for (const [index, entry] of files.entries()) {
    const maskedName = maskName(relative(absolute, entry) || basename(entry));
    const slug = files.length === 1 ? prefix : `${prefix}-${String(index + 1).padStart(2, "0")}`;

    let bytes = null;
    try {
      bytes = new Uint8Array(await readFile(entry));
    } catch {
      failures.push(`${maskedName}: could not be read`);
      continue;
    }

    const opened = await openWithPassword(bytes, password, withPassword, maskedName);
    bytes = null;
    if (opened.error) {
      failures.push(`${maskedName}: ${opened.error}`);
      continue;
    }
    // A folder usually shares one password; adopt whichever actually worked.
    password = opened.password;

    const outputPath = join(DUMP_DIR, `${slug}.md`);
    await writeFile(outputPath, renderDump({ label: slug, sourceName: maskedName, ...opened.extracted }), "utf8");
    written += 1;
    process.stdout.write(`  ${maskedName} -> ${outputPath} (${opened.extracted.pageCount} pages)\n`);
  }
  password = "";

  process.stdout.write(
    `\nWrote ${written} of ${files.length} dump(s) to ${DUMP_DIR}/, masked.\n` +
    "Read the last section of each before sharing: label wordings are printed unmasked by\n" +
    "design, and on an unfamiliar layout a short name printed left of a number can land there.\n"
  );
  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} document(s) failed:\n${failures.map((line) => `  ${line}`).join("\n")}\n`);
    process.exit(1);
  }
}

await main();

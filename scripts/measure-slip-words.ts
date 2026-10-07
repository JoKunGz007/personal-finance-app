// Reads a folder of real slip images through Vision and prints what the slip reader makes of each
// (D-253's measurement, kept as a script this time). Owner-granted measurement only (D-049).
//
// **Output is real data.** It prints each image's Vision lines and the reader's payee, memo, date and
// amount, and caches the words under `.runtime/slip-words/` (ignored) so a re-run costs no Vision
// call. Nothing it prints may become a fixture, a commit or a doc quotation. Delete the cache after.
// The Vision key comes from the environment (`GOOGLE_VISION_KEY`, loaded from `.env.local` or `.env`)
// and is never printed.
//
// Build and run with the project runtime (docs/LOCAL_DEV.md):
//   node node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild scripts/measure-slip-words.ts --bundle --platform=node --format=esm --packages=external --outfile=.runtime/measure-slip-words.mjs
//   node .runtime/measure-slip-words.mjs <image folder> <KTB|SCB|KBANK>

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { groupIntoLines, proposeAmount, proposeSlipText, readPrintedDate, type OcrWord } from "@/lib/slip-ocr";
import { readWordsWithVision } from "@/lib/vision-ocr";
import { BANK_CODES, type BankCode } from "@/lib/statement-frame";

const [folder, bankArg] = process.argv.slice(2);
if (!folder || !BANK_CODES.includes(bankArg as BankCode)) {
  console.error("usage: measure-slip-words <image folder> <KTB|SCB|KBANK>");
  process.exit(2);
}
const bank = bankArg as BankCode;
for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch { /* absent */ }
}
const key = process.env.GOOGLE_VISION_KEY ?? "";
const cacheDir = join(".runtime", "slip-words");
await mkdir(cacheDir, { recursive: true });

const images = (await readdir(folder)).filter((name) => /\.(jpe?g|png|webp)$/iu.test(name)).sort();
for (const name of images) {
  const cached = join(cacheDir, `${name}.json`);
  let words: OcrWord[];
  try {
    words = JSON.parse(await readFile(cached, "utf8")) as OcrWord[];
  } catch {
    if (!key) { console.error("GOOGLE_VISION_KEY is not set and no cache exists."); process.exit(1); }
    const read = await readWordsWithVision(new Uint8Array(await readFile(join(folder, name))), key);
    if (!read.ok) { console.log(`\n## ${name}: Vision failed (${read.reference ?? "?"})`); continue; }
    words = [...read.words];
    await writeFile(cached, JSON.stringify(words));
  }
  console.log(`\n## ${name}`);
  for (const line of groupIntoLines(words)) {
    console.log(`  [${Math.round(line[0]!.top)}] ${line.map((w) => `${w.text}${w.spaceAfter === false ? "" : " "}`).join("").trim()}`);
  }
  const text = proposeSlipText(words, bank);
  const date = readPrintedDate(words, new Date());
  const amount = proposeAmount(words, bank);
  console.log(`  -> payee: ${JSON.stringify(text.counterparty)}  memo: ${JSON.stringify(text.note)}`);
  console.log(`  -> date: ${date.ok ? `${date.value.iso} ${date.value.time ?? ""}` : `REFUSED ${date.message}`}`);
  console.log(`  -> amount: ${amount.ok ? amount.value : `REFUSED ${amount.message}`}`);
}

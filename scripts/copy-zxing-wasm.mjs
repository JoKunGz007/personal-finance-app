// Copies the ZXing reader's WebAssembly binary into `public/` so the app serves it from
// its own origin.
//
// Why this exists rather than a committed binary or a CDN link:
//
//   * **Not a CDN.** The CSP is `default-src 'self'` with no remote origin allowed, and
//     that is deliberate — a finance app that fetches executable code from a third party at
//     runtime has handed that party the page. `zxing-wasm` resolves the binary relative to
//     its own module URL, which after bundling is `/_next/static/chunks/…`, so without this
//     the fetch 404s and every decode silently fails (D-057).
//   * **Not committed.** A 1.1 MB binary in git is a review surface nobody can read, and it
//     would drift from the package version it must match. Copying it at build time from the
//     installed package makes the version match structural rather than remembered.
//
// Runs from `prebuild`, so `pnpm build` — which is what every browser config and `pnpm
// verify` run — always has it.

import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The package does not export `./package.json`, so locate it via the reader entry point:
// `<pkg>/dist/es/reader/index.js` sits two levels below `dist`, and the binary that entry
// point loads lives at `<pkg>/dist/reader/zxing_reader.wasm`.
const readerEntry = require.resolve("zxing-wasm/reader");
const source = join(dirname(readerEntry), "..", "..", "reader", "zxing_reader.wasm");
const destination = join(root, "public", "zxing_reader.wasm");

const { size } = await stat(source).catch(() => {
  throw new Error(
    `zxing-wasm's reader binary is missing at ${source}. Run \`pnpm install\` — slip capture cannot decode without it.`
  );
});

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log(`copied zxing_reader.wasm (${(size / 1024 / 1024).toFixed(2)} MB) to public/`);

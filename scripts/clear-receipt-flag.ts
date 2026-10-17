// Clears the `PLReceipt` keyword from the 7-Eleven e-tax invoice mails so the next mailbox Sync
// re-captures them (D-285's backfill: an equal-rank re-capture writes the discount names). Owner-run.
//
// **Value-free.** It opens the mailbox with the same session code the hosted Sync uses, searches with
// the Sync's own `RECEIPT_SEARCH`, and prints counts only. Without `--clear` it changes nothing; with
// it, it removes `PLReceipt` from every matching message that carries it and nothing else. It writes
// no file and touches no database. The app password is typed at a hidden prompt and never stored —
// same rule as `scripts/fetch-statements.mjs` (D-035); the mailbox address comes from the gitignored
// `statement-mailbox.json` that script already reads.
//
// Build and run with the project runtime (docs/LOCAL_DEV.md):
//   node node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild scripts/clear-receipt-flag.ts --bundle --platform=node --format=esm --packages=external --outfile=.runtime/clear-receipt-flag.mjs
//   node .runtime/clear-receipt-flag.mjs           (count only)
//   node .runtime/clear-receipt-flag.mjs --clear   (remove the keyword)

import { readFile } from "node:fs/promises";
import { RECEIPT_FLAG, RECEIPT_SEARCH } from "@/lib/server/receipt-mailbox";
import { openMailbox } from "@/lib/server/statement-mailbox-session";

function readSecret(): Promise<string> {
  return new Promise((done) => {
    let value = "";
    process.stderr.write("Mailbox app password (hidden, shown as stars): ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stderr.write("\n");
          return done(value.replace(/\s+/gu, ""));
        }
        if (ch === "\u0003") {
          process.stdin.setRawMode(false);
          process.stderr.write("\nCancelled.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) { value = value.slice(0, -1); process.stderr.write("\b \b"); }
          continue;
        }
        if (ch < " ") continue;
        value += ch;
        process.stderr.write("*");
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const config = JSON.parse(await readFile("statement-mailbox.json", "utf8")) as { user?: string };
  if (typeof config.user !== "string") throw new Error("statement-mailbox.json has no `user`.");
  const pass = await readSecret();
  if (pass === "") return void process.stderr.write("No app password given, so nothing was attempted.\n");
  const clear = process.argv.includes("--clear");

  const session = await openMailbox({ user: config.user, pass, senders: [] });
  try {
    const { client } = session;
    const uids = await client.search(RECEIPT_SEARCH, { uid: true });
    const flagged: number[] = [];
    if (uids && uids.length > 0) {
      for await (const message of client.fetch(uids, { uid: true, flags: true }, { uid: true })) {
        if (message.flags?.has(RECEIPT_FLAG)) flagged.push(message.uid);
      }
    }
    console.log(`Matching messages: ${uids ? uids.length : 0}; carrying ${RECEIPT_FLAG}: ${flagged.length}`);
    if (!clear) return void console.log("Count only. Run again with --clear to remove the keyword.");
    if (flagged.length > 0) await client.messageFlagsRemove(flagged, [RECEIPT_FLAG], { uid: true });
    let still = 0;
    if (flagged.length > 0) {
      for await (const message of client.fetch(flagged, { uid: true, flags: true }, { uid: true })) {
        if (message.flags?.has(RECEIPT_FLAG)) still += 1;
      }
    }
    console.log(`Cleared: ${flagged.length - still}; still carrying ${RECEIPT_FLAG}: ${still}. Now run Sync.`);
  } finally {
    await session.release();
  }
}

main().catch((error: unknown) => {
  // The message is not printed: imapflow's can carry the mailbox address.
  process.stderr.write(`Failed: ${error instanceof Error ? error.name : "unknown error"}. Check the app password and that IMAP is on.\n`);
  process.exit(1);
});

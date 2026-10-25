// Statement freshness, step 1 (PLAN Open item 12). Owner-run.
//
// The question: how far behind the moment the owner requests a statement does its newest row run?
// The ledger stores every row's date and time but not when the statement mail arrived, so this
// records that half. For each PDF the configured senders ever sent, it writes the mail's arrival
// time (IMAP INTERNALDATE) beside the PDF's sha256 — the same digest an import stores as
// `import_artifacts.artifact_digest` — so a read-only query can pair each mail with its batch exactly.
//
// **Read-only.** It sets no flag and touches no database. Bytes are hashed in memory and dropped.
// The output file holds digests, arrival times and the sender's domain only, in the gitignored
// `.tmp/`; the console prints counts. The app password is typed at a hidden prompt and never stored
// (D-035); the mailbox address and senders come from the gitignored `statement-mailbox.json`.
//
// Build and run with the project runtime (docs/LOCAL_DEV.md):
//   node node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild scripts/measure-statement-freshness.ts --bundle --platform=node --format=esm --packages=external --outfile=.runtime/measure-statement-freshness.mjs
//   node .runtime/measure-statement-freshness.mjs

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { FetchMessageObject, SearchObject } from "imapflow";
import { openMailbox } from "@/lib/server/statement-mailbox-session";
import { collectPdfParts, senderSearch, type MessagePart } from "@/lib/server/statement-mailbox";

const OUTPUT = ".tmp/statement-mail-times.json";

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

/** The domain of a message's sender, or null: which bank sent it, without the address. */
function senderDomain(message: FetchMessageObject): string | null {
  const address = message.envelope?.from?.[0]?.address;
  return typeof address === "string" && address.includes("@") ? address.split("@").pop()!.toLowerCase() : null;
}

async function main() {
  const config = JSON.parse(await readFile("statement-mailbox.json", "utf8")) as { user?: unknown; senders?: unknown };
  if (typeof config.user !== "string" || !Array.isArray(config.senders) || config.senders.length === 0) {
    throw new Error("statement-mailbox.json needs a `user` and a non-empty `senders` array.");
  }
  const senders = config.senders.filter((sender): sender is string => typeof sender === "string");
  const pass = await readSecret();
  if (pass === "") return void process.stderr.write("No app password given, so nothing was attempted.\n");

  const session = await openMailbox({ user: config.user, pass, senders });
  // A script downloading many PDFs can sit quieter than the route's 30 s limit (as measure-grab-mail).
  const socket = (session.client as unknown as { socket?: { setTimeout?: (ms: number) => void } }).socket;
  socket?.setTimeout?.(300_000);
  try {
    const uids = (await session.client.search(senderSearch(senders) as SearchObject, { uid: true })) || [];
    const messages: FetchMessageObject[] = [];
    if (uids.length > 0) {
      for await (const message of session.client.fetch(uids, { uid: true, bodyStructure: true, internalDate: true, envelope: true }, { uid: true })) {
        messages.push(message);
      }
    }

    const rows: { digest: string; mailAt: string; sender: string | null }[] = [];
    let noDate = 0;
    for (const message of messages) {
      const arrived = message.internalDate instanceof Date ? message.internalDate : message.internalDate ? new Date(message.internalDate) : null;
      if (!arrived || Number.isNaN(arrived.getTime())) { noDate += 1; continue; }
      for (const attachment of collectPdfParts(message.bodyStructure as MessagePart, message.uid)) {
        const download = await session.client.download(String(message.uid), attachment.part, { uid: true });
        const hash = createHash("sha256");
        for await (const chunk of download.content) hash.update(chunk as Uint8Array);
        rows.push({ digest: hash.digest("hex"), mailAt: arrived.toISOString(), sender: senderDomain(message) });
      }
    }

    await mkdir(".tmp", { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    const bySender = new Map<string, number>();
    for (const row of rows) bySender.set(row.sender ?? "(unknown)", (bySender.get(row.sender ?? "(unknown)") ?? 0) + 1);
    console.log(`Messages from the senders: ${messages.length}; PDFs hashed: ${rows.length}; messages without an arrival time: ${noDate}`);
    for (const [sender, count] of bySender) console.log(`  ${sender}: ${count}`);
    console.log(`Wrote ${OUTPUT}. Tell Claude it is there; it pairs each digest with its import read-only.`);
  } finally {
    await session.release();
  }
}

main().catch((error: unknown) => {
  // The message can quote the server, which can carry the address: print the code only.
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown; name?: unknown }).code ?? (error as { name?: unknown }).name : null;
  console.error(`Stopped: ${typeof code === "string" ? code : "an unexpected error"}.`);
  process.exit(1);
});

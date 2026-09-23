// Measures the GrabFood reader against the real statement mailbox (PLAN task 58 part 1). Owner-run.
//
// **Read-only and value-free.** It opens the mailbox with the same session code the hosted Sync uses,
// runs every Grab e-receipt through the app's own reader (`lib/delivery-grab.ts`,
// `lib/server/delivery-mailbox.ts`), and prints counts, refusal codes and masked line shapes
// (`lineShape`: labels kept, every value masked). It sets no flag, writes no file and touches no
// database. The app password is typed at a hidden prompt and never stored — same rule as
// `scripts/fetch-statements.mjs` (D-035); the mailbox address comes from the gitignored
// `statement-mailbox.json` that script already reads.
//
// Build and run with the project runtime (docs/LOCAL_DEV.md):
//   node node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild scripts/measure-grab-mail.ts --bundle --platform=node --format=esm --packages=external --outfile=.runtime/measure-grab-mail.mjs
//   node .runtime/measure-grab-mail.mjs

import { readFile } from "node:fs/promises";
import { ImapFlow, type FetchMessageObject, type SearchObject } from "imapflow";
import { classifyGrabReceipt, htmlToLines, lineShape, pairAmounts, parseGrabFood, FOOD_LABEL, TOTAL_LABEL } from "@/lib/delivery-grab";
import { DELIVERY_FLAG, DELIVERY_SEARCH, decodeBody, receiptDocuments } from "@/lib/server/delivery-mailbox";
import { openMailbox } from "@/lib/server/statement-mailbox-session";
import type { MessagePart } from "@/lib/server/statement-mailbox";

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

/** Content types of every leaf and embedded message, counted — the bundle's structure, no names. */
function typeCounts(node: MessagePart | undefined, counts: Map<string, number>) {
  if (!node) return counts;
  const key = `${node.type ?? "?"}${node.disposition ? ` (${node.disposition})` : ""}`;
  if (node.type === "message/rfc822" || !node.childNodes?.length) counts.set(key, (counts.get(key) ?? 0) + 1);
  if (node.type !== "message/rfc822") for (const child of node.childNodes ?? []) typeCounts(child, counts);
  return counts;
}

/**
 * How a refused receipt's figures relate, as yes/no answers only — never an amount. Answers "which
 * reading would make the sums close", so a reader fix can be chosen from evidence.
 */
function relations(lines: readonly string[]): string {
  const paired = pairAmounts(lines);
  if (!paired.ok) return `    pairing refused: ${paired.message}`;
  const rows = paired.value;
  const foodAt = rows.findIndex((row) => row.text.startsWith(FOOD_LABEL) && row.amount !== null);
  if (foodAt < 0) return "    no food line";
  const food = BigInt(rows[foodAt]!.amount!.minor);
  const topTotal = rows.slice(0, foodAt).find((row) => row.text === TOTAL_LABEL && row.amount)?.amount ?? null;
  let fee = 0n;
  let total: bigint | null = null;
  const discounts: bigint[] = [];
  const unsigned: bigint[] = [];
  const kinds: string[] = [];
  for (const row of rows.slice(foodAt + 1)) {
    if (!row.amount) continue;
    const value = BigInt(row.amount.minor);
    if (row.amount.negative) { discounts.push(value); kinds.push("discount"); }
    else if (row.text.startsWith("ค่าจัดส่ง")) { fee += value; kinds.push("fee"); }
    else if (row.text === TOTAL_LABEL) { total = value; kinds.push("total"); break; }
    else { unsigned.push(value); kinds.push("unsigned"); }
  }
  if (total === null) return `    tail ${kinds.join(",")}; no total`;
  const gap = food + fee - discounts.reduce((a, b) => a + b, 0n) - total;
  const unsignedSum = unsigned.reduce((a, b) => a + b, 0n);
  return [
    `    tail: ${kinds.join(", ")}`,
    `    top total present ${topTotal !== null}; equals bottom ${topTotal !== null && BigInt(topTotal.minor) === total}`,
    `    closes as printed (unsigned lines ignored) ${gap === 0n}`,
    `    closes with unsigned lines as discounts ${unsigned.length > 0 && gap - unsignedSum === 0n}`,
    `    closes with unsigned lines as charges ${unsigned.length > 0 && gap + unsignedSum === 0n}`,
    `    gap equals one discount (discount not applied to total) ${discounts.map((d, i) => (gap === -d ? i + 1 : 0)).filter(Boolean).join("/") || "no"}`,
    `    gap equals minus one discount (discount counted twice) ${discounts.map((d, i) => (gap === d ? i + 1 : 0)).filter(Boolean).join("/") || "no"}`,
    `    gap equals the fee ${fee > 0n && gap === fee}; gap positive ${gap > 0n}`
  ].join("\n");
}

function shapeOf(lines: readonly string[]): string {
  return lines.map((line, index) => `    ${String(index).padStart(3)} ${lineShape(line)}`).join("\n");
}

async function main() {
  const config = JSON.parse(await readFile("statement-mailbox.json", "utf8")) as { user?: string };
  if (typeof config.user !== "string") throw new Error("statement-mailbox.json has no `user`.");
  const pass = await readSecret();
  if (pass === "") return void process.stderr.write("No app password given, so nothing was attempted.\n");

  if (process.argv.includes("--probe")) return probe(config.user, pass);

  const session = await openMailbox({ user: config.user, pass, senders: [] });
  try {
    const uids = (await session.client.search(DELIVERY_SEARCH, { uid: true })) || [];
    const structures: FetchMessageObject[] = [];
    if (uids.length > 0) {
      for await (const message of session.client.fetch(uids, { uid: true, bodyStructure: true, flags: true }, { uid: true })) structures.push(message);
    }
    console.log(`Messages matching the search: ${uids.length}; already flagged ${DELIVERY_FLAG}: ${structures.filter((m) => m.flags?.has(DELIVERY_FLAG)).length}`);

    const kinds = { food: 0, ride: 0, other: 0 };
    const refused = new Map<string, number>();
    const firstRefusal = new Map<string, string[]>();
    const bookings = new Map<string, number>();
    let undecodable = 0, ok = 0, zeroTotal = 0, noFee = 0, noPayment = 0, withOptions = 0, discounted = 0, charged = 0;
    let okShape: string[] | null = null;
    let rideShape: string[] | null = null;
    const bigBundleTypes = new Map<string, number>();
    const optionCounts = new Map<number, number>();

    for (const message of structures) {
      const documents = receiptDocuments(message.bodyStructure as MessagePart);
      if (documents.length > 5) typeCounts(message.bodyStructure as MessagePart, bigBundleTypes);
      if (documents.length === 0) { kinds.other += 1; continue; }
      const fetched = await session.client.fetchOne(message.uid, { bodyParts: documents.map((d) => d.part) }, { uid: true });
      for (const document of documents) {
        const raw = fetched ? fetched.bodyParts?.get(document.part) ?? fetched.bodyParts?.get(document.part.toLowerCase()) : undefined;
        const html = raw ? decodeBody(raw, document, fetched && fetched.binaryParts ? fetched.binaryParts.has(document.part) : false) : null;
        if (html === null) { undecodable += 1; continue; }
        const lines = htmlToLines(html);
        const kind = classifyGrabReceipt(lines);
        kinds[kind] += 1;
        if (kind === "ride" && !rideShape) rideShape = lines.slice(0, 40);
        if (kind !== "food") continue;
        const parsed = parseGrabFood(lines);
        if (parsed.ok) {
          ok += 1;
          bookings.set(parsed.value.bookingId, (bookings.get(parsed.value.bookingId) ?? 0) + 1);
          if (parsed.value.totalMinor === "0") zeroTotal += 1;
          if (parsed.value.deliveryFeeMinor === null) noFee += 1;
          if (parsed.value.paymentMethod === null) noPayment += 1;
          if (parsed.value.items.some((item) => item.options.length > 0)) withOptions += 1;
          if (parsed.value.adjustments.some((row) => row.kind === "discount")) discounted += 1;
          if (parsed.value.adjustments.some((row) => row.kind === "charge")) charged += 1;
          for (const item of parsed.value.items) optionCounts.set(item.options.length, (optionCounts.get(item.options.length) ?? 0) + 1);
          if (!okShape) okShape = lines;
        } else {
          refused.set(parsed.code, (refused.get(parsed.code) ?? 0) + 1);
          if (!firstRefusal.has(parsed.code)) firstRefusal.set(parsed.code, lines);
          console.log(`Refused ${parsed.code}: ${parsed.message}\n${relations(lines)}`);
          // `--show-refused`, owner-asked: the money lines only (food subtotal to total), unmasked,
          // to the terminal and nowhere else. No dish, restaurant, name, address or booking ID.
          if (process.argv.includes("--show-refused")) {
            const from = lines.findIndex((line) => line.startsWith(FOOD_LABEL));
            const to = lines.findIndex((line, index) => index > from && line === TOTAL_LABEL);
            if (from >= 0 && to > from) console.log(lines.slice(from, to + 2).map((line) => `      | ${line}`).join("\n"));
          }
        }
      }
    }

    console.log(`Documents: food ${kinds.food}, ride ${kinds.ride}, other ${kinds.other}, undecodable ${undecodable}`);
    console.log(`Food read: ${ok}; refused: ${[...refused].map(([code, n]) => `${code} ${n}`).join(", ") || "none"}`);
    console.log(`Distinct booking IDs: ${bookings.size}; read more than once: ${[...bookings.values()].filter((n) => n > 1).length}`);
    console.log(`Zero-total ${zeroTotal}; no delivery line ${noFee}; no payment line ${noPayment}; with options ${withOptions}; with discounts ${discounted}; with charges ${charged}`);
    console.log(`Dishes by option-line count: ${[...optionCounts].sort(([a], [b]) => a - b).map(([n, dishes]) => `${n} lines: ${dishes}`).join(", ") || "none"}`);
    console.log(`Leaf types in bundles: ${[...bigBundleTypes].map(([type, n]) => `${type} ${n}`).join(", ") || "no bundle seen"}`);
    for (const [code, lines] of firstRefusal) {
      console.log(`\nFirst ${code} (masked):`);
      const foodAt = lines.findIndex((line) => line.startsWith(FOOD_LABEL));
      const totalAt = lines.findIndex((line, index) => index > foodAt && line.startsWith(TOTAL_LABEL));
      console.log(shapeOf(lines.slice(0, Math.max(totalAt, foodAt, 60) + 3)));
    }
    if (okShape) console.log(`\nOne read receipt (masked):\n${shapeOf(okShape)}`);
    if (rideShape) console.log(`\nOne ride receipt, first 40 lines (masked):\n${shapeOf(rideShape)}`);
  } finally {
    await session.release();
  }
}

/**
 * `--probe`: how many messages each candidate search finds, in INBOX, All Mail and Spam. Counts
 * only — no subject, sender or body is printed. For when the main search finds nothing.
 */
async function probe(user: string, pass: string) {
  const client = new ImapFlow({
    host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false,
    disableAutoIdle: true, greetingTimeout: 10_000, socketTimeout: 60_000
  });
  await client.connect();
  try {
    const boxes = await client.list();
    const targets = [
      boxes.find((box) => box.path.toUpperCase() === "INBOX"),
      boxes.find((box) => box.specialUse === "\\All"),
      boxes.find((box) => box.specialUse === "\\Junk")
    ].filter((box) => box !== undefined);
    const searches: [string, SearchObject][] = [
      ["subject E-Receipt", { subject: "E-Receipt" }],
      ["subject Receipt", { subject: "Receipt" }],
      ["subject Grab", { subject: "Grab" }],
      ["from no-reply@grab.com", { from: "no-reply@grab.com" }],
      ["gmraw subject:e-receipt", { gmraw: "subject:e-receipt" }],
      ["gmraw subject:(e-receipts backfill)", { gmraw: "subject:(e-receipts backfill)" }],
      ["gmraw from:no-reply@grab.com", { gmraw: "from:no-reply@grab.com" }],
      ["gmraw has:attachment filename:eml", { gmraw: "has:attachment filename:eml" }],
      ["everything", { all: true }]
    ];
    for (const box of targets) {
      const lock = await client.getMailboxLock(box.path);
      try {
        const counts: string[] = [];
        for (const [label, search] of searches) {
          const found = await client.search(search, { uid: true }).catch(() => null);
          counts.push(`${label}: ${found === null ? "error" : found ? found.length : 0}`);
        }
        console.log(`${box.specialUse ?? "INBOX"}\n  ${counts.join("\n  ")}`);
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

main().catch((error: unknown) => {
  // The message is not printed: imapflow's can carry the mailbox address.
  process.stderr.write(`Failed: ${error instanceof Error ? error.name : "unknown error"}. Check the app password and that IMAP is on.\n`);
  process.exit(1);
});

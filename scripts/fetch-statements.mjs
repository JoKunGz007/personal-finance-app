// Pulls statement PDFs out of the dedicated mailbox and writes them where the import form can
// reach them. Local, manual, and the whole of "auto-import v1".
//
// **This is the cheap half of a design whose expensive half was deliberately not built** (D-141).
// Everything after the files land is the bulk import that already exists: the owner picks them,
// types the document password once, and binds and confirms each statement himself. Nothing here
// decrypts anything, nothing here reaches the ledger, and no credential that can write to the
// ledger exists on this machine. The IMAP work lives in `lib/server/statement-mailbox.ts` so that
// a hosted "Sync" button, if it is ever wanted, is a second caller of that module rather than a
// second implementation of this.
//
// **The app password is read from stdin, never from an argument and never from a file.** An
// argument is visible to every process on this machine and lands in shell history; an environment
// variable outlives the run and is readable by every child process. This is the rule D-035 set for
// document passwords, applied to a mailbox credential that is merely rotatable rather than
// identity-grade — the weaker secret gets the same channel because the habit is what protects the
// stronger one. Piping works, which is the point:
//
//   bw get password "Private Ledger - Gmail IMAP app password" | node scripts/fetch-statements.mjs
//
// Or type it when prompted. Usage, from the repo root with the project-local Node 24 on PATH:
//
//   node scripts/fetch-statements.mjs                 # since the last run, or the last 30 days
//   node scripts/fetch-statements.mjs --days 90       # a wider window
//   node scripts/fetch-statements.mjs --all           # every message the senders ever sent
//
// **What it prints is counts and masked names, never a value.** A statement's filename routinely
// carries an account number or the holder's name, which is why `scripts/mask-statement.mjs` masks
// it before writing a dump; the same rule holds here, and every digit is replaced with `d` before
// anything reaches the terminal.
//
// **Where it writes is inside `private-statements/`,** which is gitignored and is the directory an
// agent may never read (D-035, D-049). These are real, password-protected statements. Nothing here
// may become a fixture, a quotation, or a screenshot.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ImapFlow } from "imapflow";
import {
  collectPdfParts, maskFileName, safeFileName, senderSearch
} from "../lib/server/statement-mailbox.ts";

const HOST = "imap.gmail.com";
const PORT = 993;

// The mailbox and the senders it receives from. Not secrets — a bank's sending address is public
// and the mailbox address is not a credential — but they are configuration, so they live in one
// place rather than being typed at a prompt where a typo silently returns nothing.
const CONFIG_PATH = "statement-mailbox.json";
const OUT_DIR = join("private-statements", "inbox");
const STATE_PATH = join(OUT_DIR, ".fetch-state.json");

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function flagValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function readConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.user !== "string" || !Array.isArray(parsed.senders) || parsed.senders.length === 0) {
      throw new Error("needs a `user` string and a non-empty `senders` array");
    }
    return { user: parsed.user, senders: parsed.senders };
  } catch (error) {
    if (error?.code === "ENOENT") {
      process.stderr.write(
        `No ${CONFIG_PATH} found. Create one beside the repo root:\n\n` +
        `  {\n    "user": "the-mailbox@gmail.com",\n` +
        `    "senders": ["statements@bank-one.example", "noreply@bank-two.example"]\n  }\n\n` +
        `It is gitignored. It holds no secret — the app password is read from stdin.\n`
      );
      process.exit(2);
    }
    process.stderr.write(`${CONFIG_PATH} could not be read: ${error.message}\n`);
    process.exit(2);
  }
}

/**
 * Reads the app password from the terminal, one keypress at a time.
 *
 * **Raw mode rather than `readline`, so that pasting works.** Muting readline by replacing
 * `_writeToOutput` hides the typing but also breaks its line editing, and a paste arrives as a
 * burst it then renders wrongly — which looks like the paste failing. In raw mode a paste is just
 * a chunk of characters and needs no special handling at all, from Ctrl+V or right-click alike.
 *
 * **A star per character rather than nothing.** Hiding the value entirely gave no way to tell a
 * successful paste from a silently empty one, which is the difference between a real credential
 * failure and a clipboard that did not arrive. The count is not the secret.
 */
function readSecretFromTerminal(show) {
  return new Promise((done) => {
    let value = "";
    process.stderr.write(`Mailbox app password (${show ? "visible" : "hidden, shown as stars"}): `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stderr.write("\n");
      done(value.replace(/\s+/gu, ""));
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") {
          // Ctrl+C. Restore the terminal before leaving, or the shell keeps raw mode and stops
          // echoing anything typed afterwards.
          process.stdin.setRawMode(false);
          process.stderr.write("\nCancelled.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stderr.write("\b \b");
          }
          continue;
        }
        // Ctrl+V itself, when a terminal passes it through rather than pasting for us. The text
        // arrives as ordinary characters either way, so the control code is simply ignored.
        if (ch === "\u0016") continue;
        if (ch < " ") continue;
        value += ch;
        process.stderr.write(show ? ch : "*");
      }
    };

    process.stdin.on("data", onData);
  });
}

/**
 * The app password, from a pipe if there is one and from the terminal otherwise.
 *
 * Never echoed to a file, never written anywhere, and held only for the length of the connection.
 */
async function readSecret() {
  // **Not a terminal means there is nothing to prompt.** Whatever was piped is the answer, empty
  // included — falling through to a prompt here would wait for input that can never arrive, which
  // looks like the fetch hanging on the network.
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\s+/gu, "");
  }
  // Gmail displays an app password in four groups of four for readability; the spaces are not part
  // of it, and pasting them is the most common way this fails with a bare "invalid credentials"
  // that says nothing about why. Stripped rather than rejected.
  return readSecretFromTerminal(flag("show-password"));
}

/** When the last run finished, so an ordinary run asks the server for very little. */
async function readSince(days) {
  if (flag("all")) return null;
  if (days !== null) return new Date(Date.now() - days * 86_400_000);
  try {
    const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
    const previous = new Date(state.lastRunAt);
    if (!Number.isNaN(previous.getTime())) {
      // A day of overlap, deliberately. IMAP `since` has date granularity rather than time, and a
      // mail delivered while a run was in progress would otherwise fall between two windows and be
      // missed silently. Re-seeing a message costs nothing: the skip below is by filename.
      return new Date(previous.getTime() - 86_400_000);
    }
  } catch {
    // No state yet, or it is unreadable. Fall through to the default window rather than failing:
    // this file is a convenience, and a corrupt one must not stop a fetch.
  }
  return new Date(Date.now() - 30 * 86_400_000);
}

async function alreadyHave(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { user, senders } = await readConfig();
  const days = flagValue("days", null);
  const since = await readSince(days);
  const pass = await readSecret();
  if (pass === "") {
    process.stderr.write("No app password given, so nothing was attempted.\n");
    process.exit(2);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    // The library logs message subjects and addresses at info level. Off entirely: this process
    // handles real financial mail and its output is the one thing a person reads.
    logger: false
  });

  let saved = 0;
  let skipped = 0;
  let messages = 0;

  try {
    await client.connect();
  } catch (error) {
    process.stderr.write(
      `Could not sign in to the mailbox: ${error.message}\n` +
      "If this says invalid credentials: the app password is 16 characters with no spaces, IMAP " +
      "must be enabled in that account's Gmail settings, and it must be the mailbox's own app " +
      "password rather than another account's.\n"
    );
    process.exit(1);
  }

  // A lock rather than a bare `mailboxOpen`, so the connection cannot be left holding the mailbox
  // if this throws partway through a download.
  const lock = await client.getMailboxLock("INBOX");
  try {
    const criteria = senderSearch(senders);
    const search = since === null ? criteria : { ...criteria, since };
    const uids = await client.search(search, { uid: true });

    if (!uids || uids.length === 0) {
      process.stdout.write(
        `No matching mail${since === null ? "" : ` since ${since.toISOString().slice(0, 10)}`}. ` +
        "Nothing was downloaded.\n"
      );
    }

    for (const uid of uids ?? []) {
      const message = await client.fetchOne(uid, { bodyStructure: true }, { uid: true });
      if (!message || !message.bodyStructure) continue;
      messages += 1;

      // Every PDF in the message, because a statement mail routinely carries more than one and not
      // all of them are statements (D-141). The reader refuses a non-statement outright and it
      // lands in the import worklist saying so, which is the right place for that judgement.
      const parts = collectPdfParts(message.bodyStructure, uid);
      for (const attachment of parts) {
        const name = safeFileName(attachment.declaredName, `statement-uid-${uid}-part-${attachment.part}.pdf`);
        const target = join(OUT_DIR, name);
        if (await alreadyHave(target)) {
          skipped += 1;
          continue;
        }
        // Only this part is fetched. The message body is never downloaded, so nothing this process
        // holds in memory is readable prose about the owner's finances.
        const download = await client.download(uid, attachment.part, { uid: true });
        const chunks = [];
        for await (const chunk of download.content) chunks.push(chunk);
        await writeFile(target, Buffer.concat(chunks));
        saved += 1;
        process.stdout.write(`  saved ${maskFileName(name)}\n`);
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  // **Written after a successful pass only.** A run that threw partway leaves the previous mark in
  // place, so the next one re-covers the same window rather than stepping over whatever was missed.
  await writeFile(STATE_PATH, JSON.stringify({ lastRunAt: new Date().toISOString() }, null, 2));

  process.stdout.write(
    `\n${messages} matching message(s); ${saved} file(s) saved, ${skipped} already present.\n` +
    `They are in ${resolve(OUT_DIR)}.\n` +
    "The mail is left untouched — nothing was read, moved or deleted.\n" +
    (saved > 0 ? "Import them from /import — choose several at once, type the document password, and confirm each.\n" : "")
  );
}

await main();

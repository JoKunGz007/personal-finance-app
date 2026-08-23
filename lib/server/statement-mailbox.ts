// Reading statement PDFs out of the dedicated mailbox, over IMAP.
//
// **This module is the seam, and its shape is the whole reason it exists.** It finds candidate
// attachments and hands back their bytes; it never decides where those bytes go. The local
// fetcher (`scripts/fetch-statements.mjs`) writes them to disk. If a hosted "Sync" button is ever
// built, it is a second caller of exactly this — a route that streams the same bytes to the
// browser — rather than a second implementation of IMAP. Same split as `lib/slip-batch.ts` against
// `app/slip-batch.tsx`, and for the same reason: two copies of a fiddly protocol means one of them
// rots quietly.
//
// **It is server-only and must stay that way.** It opens a TLS socket, so nothing here can run in
// a browser and none of it may be imported from a client component. That is why it lives under
// `lib/server/`.
//
// **Nothing here decrypts anything.** The PDFs are password-protected by the bank and stay that
// way: this moves ciphertext. The document password is never handled by this module, never asked
// for, and never stored — it is typed into the import form on the device, exactly as before
// (D-035, D-141).

/** What a message part has to look like to be worth downloading. */
export type MessagePart = {
  /** IMAP part path, e.g. `2` or `1.2`. */
  readonly part?: string;
  readonly type?: string;
  readonly disposition?: string;
  readonly dispositionParameters?: Readonly<Record<string, string>>;
  readonly parameters?: Readonly<Record<string, string>>;
  /** The part's encoded size in bytes, as the server reports it. Absent on some servers. */
  readonly size?: number;
  readonly childNodes?: readonly MessagePart[];
};

export type StatementAttachment = {
  /** The message's IMAP UID, stable within a mailbox session. */
  readonly uid: number;
  /** IMAP part path to download, so only this part is fetched and never the whole message. */
  readonly part: string;
  /** The name the mail gave it. **Never trust this as a path** — see `safeFileName`. */
  readonly declaredName: string;
  readonly sizeBytes: number;
};

const PDF_MIME = "application/pdf";

/**
 * Whether one part is a PDF attachment worth pulling.
 *
 * **Matched on content type first and file extension second, because both are wrong sometimes.**
 * Mail clients label PDFs `application/octet-stream` often enough that type alone misses real
 * statements, and a `.pdf` suffix on a non-PDF part is equally possible. Either signal admits it;
 * the reader downstream refuses anything that is not actually a statement, so a false positive here
 * costs one wasted download and shows up in the worklist as unreadable rather than as silence.
 */
export function isPdfAttachment(node: MessagePart): boolean {
  const declared = attachmentName(node);
  const type = (node.type ?? "").toLowerCase();
  if (type === PDF_MIME) return true;
  return declared.toLowerCase().endsWith(".pdf");
}

/** The filename a part declares, from either of the two headers that can carry it. */
export function attachmentName(node: MessagePart): string {
  return node.dispositionParameters?.filename
    ?? node.parameters?.name
    ?? "";
}

/**
 * Every PDF attachment in one message's body structure, depth first.
 *
 * **A statement mail carries more than one PDF, routinely, and not all of them are statements.**
 * Measured against the owner's own three banks on 2026-08-23: one sent two months in a single mail,
 * another sent a statement alongside an unrelated document. So this collects *all* of them and
 * decides nothing about which is which — `readStatement` already refuses a non-statement with
 * `UNSUPPORTED_LAYOUT`, and it lands in the import worklist's blocked list saying so. Guessing here
 * would put that judgement in a mail parser, which is the wrong place for it and is unnecessary.
 */
export function collectPdfParts(root: MessagePart | undefined, uid: number): StatementAttachment[] {
  const found: StatementAttachment[] = [];
  const walk = (node: MessagePart) => {
    for (const child of node.childNodes ?? []) walk(child);
    // A container node has children and no part path of its own; only leaves are downloadable.
    if (node.childNodes && node.childNodes.length > 0) return;
    if (!node.part || !isPdfAttachment(node)) return;
    found.push({
      uid,
      part: node.part,
      declaredName: attachmentName(node),
      sizeBytes: node.size ?? 0
    });
  };
  if (root) walk(root);
  return found;
}

/**
 * A filename safe to write, derived from one the mail supplied.
 *
 * **An attachment filename is attacker-controlled input and must never reach a path unfiltered.**
 * A mail can declare `../../.env` or `..\\..\\config` as its filename, and joining that to an
 * output directory writes outside it. So this keeps only the basename's safe characters and never
 * a separator, and it refuses to produce an empty or dot-only name.
 *
 * **The declared name is also not something to preserve faithfully.** A statement's filename
 * routinely carries an account number or the holder's name — which is why
 * `scripts/mask-statement.mjs` masks it before writing a dump. Here the name is kept only as far as
 * it is safe, and the *caller* is what must not print it.
 */
export function safeFileName(declared: string, fallback: string): string {
  const base = declared.split(/[\\/]/u).pop() ?? "";
  const cleaned = base
    // Control characters first: a filename may legally contain them and a terminal interprets
    // some of them, so they go before anything else reads the string.
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    // Reserved on Windows, which is where this runs.
    .replace(/[<>:"|?*]/gu, "")
    .replace(/^\.+/u, "")
    .trim();
  // Checked **after** the stripping, not before. `.pdf` strips to `pdf`, which is not empty and
  // does not end in `.pdf`, so an earlier check let it through and the extension was appended to
  // produce `pdf.pdf` — a name carrying nothing, written as though it meant something.
  if (cleaned === "" || cleaned.toLowerCase() === "pdf") return fallback;
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

/**
 * The filename with every digit run masked, for printing.
 *
 * The same rule `scripts/mask-statement.mjs` applies and for the same reason: a statement's name
 * carries account numbers and dates, and a fetcher that lists what it saved would put them in a
 * terminal, a log and any transcript that captures one. Shapes are reportable; values are not.
 */
export function maskFileName(name: string): string {
  return name.replace(/\d/gu, "d");
}

/**
 * The IMAP search for statement mail from the senders that carry it.
 *
 * **`or` is nested rather than given a list**, because the IMAP grammar's OR takes exactly two
 * arguments. A flat list is silently wrong in a way that still returns results — it matches on the
 * first pair and drops the rest, which looks like a bank that stopped sending rather than like a
 * bug. (The Gmail *filter* has the same trap in a different syntax: a comma-separated `from:` list
 * does not behave as OR there either.)
 */
export function senderSearch(senders: readonly string[]): Record<string, unknown> {
  if (senders.length === 0) throw new Error("At least one sender address is needed.");
  return senders
    .map((from) => ({ from }) as Record<string, unknown>)
    .reduce((left, right) => ({ or: [left, right] }));
}

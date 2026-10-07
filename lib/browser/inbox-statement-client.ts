import type { StatementAnswer } from "@/lib/inbox-drain";
import type { SourceRowCandidate } from "@/lib/statement";
import { EMPTY_STATEMENT_MESSAGE, type StatementFrame } from "@/lib/statement-frame";
import { readError } from "@/lib/wire";

/**
 * Asks the server about a statement PDF waiting in the Inbox (`POST /api/v1/inbox/statement`, D-235).
 * The server holds the statement passwords, opens the PDF and either imports it ("import") or hands
 * back what it read for the Import page's own review ("read"). Nothing here stores or decides money.
 */

const ROUTE = "/api/v1/inbox/statement";

export { INBOX_STATEMENT_NAME } from "@/lib/inbox-queue";

export type StatementImportPosted =
  | { readonly ok: true; readonly answer: StatementAnswer }
  /** `status` is the HTTP status when the route answered with one; absent for a transport failure. */
  | { readonly ok: false; readonly why: string; readonly status?: number };

export type StatementReadPosted =
  | { readonly ok: true; readonly artifactDigest: string; readonly frame: StatementFrame; readonly rows: SourceRowCandidate[] }
  | { readonly ok: false; readonly held: string }
  | { readonly ok: false; readonly held: null; readonly why: string };

const MAILBOX_ROUTE = "/api/v1/imports/mailbox/statement";

type MailboxRefLike = { readonly uid: number; readonly part: string };

async function post(route: string, payload: Record<string, unknown>): Promise<
  { readonly ok: true; readonly body: Record<string, unknown> } | { readonly ok: false; readonly why: string; readonly status?: number }
> {
  try {
    const response = await fetch(route, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = typeof body === "object" && body !== null && typeof (body as { code?: unknown }).code === "string"
        ? ` (${(body as { code: string }).code})` : "";
      return { ok: false, why: `${readError(body, "The statement could not be fetched.")}${code}`, status: response.status };
    }
    if (typeof body !== "object" || body === null) return { ok: false, why: "The statement answer could not be read." };
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, why: "The statement could not be reached. It will be tried again next time." };
  }
}

/** Import mode: `captured`, `duplicate`, `empty` or `held`; anything else, or any failure, is not-ok (the file stays). */
export async function postStatementImport(objectName: string): Promise<StatementImportPosted> {
  return importAnswer(await post(ROUTE, { objectName, mode: "import" }));
}

/** The same import for a statement in the owner's mailbox (D-237); the server flags the message once it is in the ledger. */
export async function postMailboxStatementImport(ref: MailboxRefLike): Promise<StatementImportPosted> {
  return importAnswer(await post(MAILBOX_ROUTE, { uid: ref.uid, part: ref.part, mode: "import" }));
}

function importAnswer(answer: Awaited<ReturnType<typeof post>>): StatementImportPosted {
  if (!answer.ok) return answer;
  const { kind, reason, rowCount, existingRows } = answer.body;
  const count = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined);
  if (kind === "captured") {
    const rows = count(rowCount);
    const existing = count(existingRows);
    // Both or neither: a split pair would report counts that do not add up.
    return { ok: true, answer: rows !== undefined && existing !== undefined && existing <= rows ? { kind, rowCount: rows, existingRows: existing } : { kind } };
  }
  if (kind === "duplicate") {
    const rows = count(rowCount);
    return { ok: true, answer: rows === undefined ? { kind } : { kind, rowCount: rows } };
  }
  if (kind === "empty") return { ok: true, answer: { kind } };
  if (kind === "held" && typeof reason === "string") return { ok: true, answer: { kind: "held", reason } };
  return { ok: false, why: "The statement answer could not be read." };
}

/** Read mode: the frame and rows the server read, or why it held the file. */
export async function readInboxStatement(objectName: string): Promise<StatementReadPosted> {
  return readAnswer(await post(ROUTE, { objectName, mode: "read" }));
}

/** Read mode for a mailbox statement. */
export async function readMailboxStatement(ref: MailboxRefLike): Promise<StatementReadPosted> {
  return readAnswer(await post(MAILBOX_ROUTE, { uid: ref.uid, part: ref.part, mode: "read" }));
}

function readAnswer(answer: Awaited<ReturnType<typeof post>>): StatementReadPosted {
  if (!answer.ok) return { ok: false, held: null, why: answer.why };
  const { kind, reason, artifactDigest, frame, rows } = answer.body;
  if (kind === "held" && typeof reason === "string") return { ok: false, held: reason };
  if (kind === "empty") return { ok: false, held: null, why: EMPTY_STATEMENT_MESSAGE };
  if (
    kind === "read" && typeof artifactDigest === "string" && /^[0-9a-f]{64}$/u.test(artifactDigest)
    && typeof frame === "object" && frame !== null && Array.isArray(rows)
  ) {
    return { ok: true, artifactDigest, frame: frame as StatementFrame, rows: rows as SourceRowCandidate[] };
  }
  return { ok: false, held: null, why: "The statement answer could not be read." };
}

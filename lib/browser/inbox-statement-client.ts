import type { StatementAnswer } from "@/lib/inbox-drain";
import type { SourceRowCandidate } from "@/lib/statement";
import type { StatementFrame } from "@/lib/statement-frame";
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
  | { readonly ok: false; readonly why: string };

export type StatementReadPosted =
  | { readonly ok: true; readonly artifactDigest: string; readonly frame: StatementFrame; readonly rows: SourceRowCandidate[] }
  | { readonly ok: false; readonly held: string }
  | { readonly ok: false; readonly held: null; readonly why: string };

async function post(objectName: string, mode: "import" | "read"): Promise<
  { readonly ok: true; readonly body: Record<string, unknown> } | { readonly ok: false; readonly why: string }
> {
  try {
    const response = await fetch(ROUTE, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectName, mode })
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = typeof body === "object" && body !== null && typeof (body as { code?: unknown }).code === "string"
        ? ` (${(body as { code: string }).code})` : "";
      return { ok: false, why: `${readError(body, "The statement could not be fetched.")}${code}` };
    }
    if (typeof body !== "object" || body === null) return { ok: false, why: "The statement answer could not be read." };
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, why: "The statement could not be reached. It will be tried again next time." };
  }
}

/** Import mode: `captured`, `duplicate` or `held`; anything else, or any failure, is not-ok (the file stays). */
export async function postStatementImport(objectName: string): Promise<StatementImportPosted> {
  const answer = await post(objectName, "import");
  if (!answer.ok) return answer;
  const { kind, reason } = answer.body;
  if (kind === "captured" || kind === "duplicate") return { ok: true, answer: { kind } };
  if (kind === "held" && typeof reason === "string") return { ok: true, answer: { kind: "held", reason } };
  return { ok: false, why: "The statement answer could not be read." };
}

/** Read mode: the frame and rows the server read, or why it held the file. */
export async function readInboxStatement(objectName: string): Promise<StatementReadPosted> {
  const answer = await post(objectName, "read");
  if (!answer.ok) return { ok: false, held: null, why: answer.why };
  const { kind, reason, artifactDigest, frame, rows } = answer.body;
  if (kind === "held" && typeof reason === "string") return { ok: false, held: reason };
  if (
    kind === "read" && typeof artifactDigest === "string" && /^[0-9a-f]{64}$/u.test(artifactDigest)
    && typeof frame === "object" && frame !== null && Array.isArray(rows)
  ) {
    return { ok: true, artifactDigest, frame: frame as StatementFrame, rows: rows as SourceRowCandidate[] };
  }
  return { ok: false, held: null, why: "The statement answer could not be read." };
}

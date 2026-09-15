// What the hosted "Sync" button is allowed to ask for, and what it is allowed to say back.
//
// **Pure, and deliberately reachable from a browser.** Nothing here opens a socket, reads an
// environment variable or touches `imapflow`; it is the policy half of the same split
// `lib/statement-batch.ts` has against `app/statement-batch.tsx`, and for the same reason — the
// decisions are the part worth testing, and a test for them should not need a mailbox. The IMAP
// half stays in `lib/server/`, which is the boundary keeping a TLS client out of the client
// bundle.
//
// **The shape this file guards is that the browser names a message part and the server obeys.** A
// part path arrives from the page as a string, so it is validated here rather than trusted: `uid`
// must be a positive integer and `part` must be dotted digits and nothing else. The route then
// re-derives the candidate list from the mailbox itself and refuses anything not in it, so this is
// the first of two checks rather than the only one.
//
// **Nothing here decrypts, and nothing here sees the document password.** What moves is the bank's
// own ciphertext. The password is typed into the import form and reaches the pdf.js worker on the
// device, exactly as it did before this button existed (D-035, D-141).

/**
 * The most attachments one sync will offer.
 *
 * **Matched to `MAX_BATCH_FILES` on purpose**, because everything this returns is destined for that
 * worklist — offering more than the batch can hold would put the refusal in the wrong place, after
 * the bytes had already been pulled across the network.
 */
export const MAX_SYNC_ATTACHMENTS = 40;

/**
 * The most matching messages one sync will examine, independent of how many contribute.
 *
 * **Dedup reopened the gateway-timeout failure `MAX_SYNC_ATTACHMENTS` was built to close, by a
 * different road.** The cap above stops the search once enough *attachments* have been found — and
 * before a message could be skipped for having nothing new left in it, almost every matching
 * message contributed at least one, so the two bounds were nearly the same thing in practice. Once
 * repeat syncs leave most old mail already-fetched, a wide enough window (`?all=1` most of all) can
 * walk the mailbox's entire history one round trip apiece without ever finding forty *new*
 * attachments — which is exactly the "thousands of sequential fetches inside one request" failure
 * the attachment cap exists to prevent, just no longer prevented by it. This is a second, independent
 * brake on the same failure, tripped by messages examined rather than by attachments returned.
 *
 * **Since D-194 the examined messages are fetched in one IMAP command rather than one each**, so
 * this now bounds the size of that command and its answer rather than a count of round trips. The
 * failure it guards against is the same one: a sync whose cost grows with the mailbox's history.
 */
export const MAX_SYNC_MESSAGES_SCANNED = 200;

/**
 * The largest single attachment the route will download.
 *
 * **A memory bound, not a policy about statements.** A real statement is a few hundred kilobytes;
 * this exists so a mail carrying something enormous cannot make a server process hold it. The size
 * compared against it is the server's *encoded* figure from the body structure, which overstates
 * the decoded bytes by about a third — erring toward refusing late rather than early.
 */
export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

/** How far back an ordinary sync looks when nothing says otherwise. */
export const DEFAULT_SYNC_DAYS = 30;

/** The widest window that can be asked for by day, before `all` is the honest request. */
export const MAX_SYNC_DAYS = 3650;

/** One downloadable PDF part, as the page sees it. */
export type SyncAttachment = {
  /** Stable within one sync: what the page keys its rows on and sends back to fetch bytes. */
  readonly id: string;
  readonly uid: number;
  readonly part: string;
  /** The filename, cleaned to something safe to display and to hand to `new File(...)`. */
  readonly name: string;
  /** The server's encoded size. Shown so a slow download is not a surprise; never authoritative. */
  readonly sizeBytes: number;
};

/** What `GET /api/v1/imports/mailbox` answers. */
export type SyncManifest = {
  /** Matching messages seen, so "three mails, five PDFs" is sayable. */
  readonly messages: number;
  readonly attachments: readonly SyncAttachment[];
  /**
   * Whether the search stopped with mail still unexamined — at `MAX_SYNC_ATTACHMENTS` PDFs found
   * **or** at `MAX_SYNC_MESSAGES_SCANNED` messages examined, whichever came first.
   *
   * **The second cap is why this can now be true on an empty manifest.** The attachment cap
   * cannot trip without at least one attachment, so "truncated and empty" used to be
   * unreachable; the scanned-message cap trips on messages *looked at*, which per-part dedup
   * makes routine — a mailbox whose newest messages are all already fetched contributes nothing
   * while still costing the scan. Anything reading this flag must therefore handle the empty
   * case, which `describeManifest` below did not until it was corrected.
   *
   * **A flag rather than a count, because the count is not knowable without paying for it.** The
   * route stops issuing IMAP round trips once it has enough — reading the rest of the mailbox only
   * to say "and 7 more" would be the unbounded scan the cap exists to prevent. So this says
   * *there is more*, which is what the owner can act on, and does not invent a number.
   */
  readonly truncated: boolean;
  /** The window actually used, as a plain date, or null for "everything". */
  readonly since: string | null;
};

/**
 * The senders a deployment is configured to accept mail from.
 *
 * **Comma or whitespace separated, because an environment variable is typed by a person** and both
 * are what a person types. Lower-cased and de-duplicated so the same address written twice does not
 * become two IMAP `or` branches, and anything without an `@` is dropped rather than passed to the
 * server — a typo that reaches IMAP comes back as "no mail", which reads exactly like a bank that
 * stopped sending.
 */
export function parseSenders(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const piece of raw.split(/[,\s]+/u)) {
    const address = piece.trim().toLowerCase();
    if (address === "" || !address.includes("@")) continue;
    seen.add(address);
  }
  return [...seen];
}

/**
 * Whether a part path is one this app will ask a mail server for.
 *
 * IMAP part paths are dotted digit runs (`2`, `1.2`, `1.2.1`). **Anything else is refused rather
 * than escaped**, because a part path is not a value with a safe encoding — it is a selector, and
 * the only correct answer to an unexpected one is no.
 */
export function isSafePartPath(part: string): boolean {
  return /^[1-9][0-9]*(?:\.[1-9][0-9]*)*$/u.test(part);
}

/** A UID from a query string, or null if it is not a plain positive integer. */
export function parseUid(raw: string | null | undefined): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/u.test(raw)) return null;
  const uid = Number(raw);
  return Number.isSafeInteger(uid) ? uid : null;
}

/** The key one attachment is known by for the length of a sync. */
export function attachmentId(uid: number, part: string): string {
  return `${uid}.${part}`;
}

/**
 * Where the page fetches one attachment's bytes from — `GET` to download, `POST` to acknowledge it
 * has been confirmed into the ledger (see `MailboxRef` below). Same path both ways, same-origin, so
 * the CSP is untouched either way.
 */
export function attachmentPath(uid: number, part: string): string {
  return `/api/v1/imports/mailbox/attachment?uid=${encodeURIComponent(String(uid))}&part=${encodeURIComponent(part)}`;
}

/**
 * Which mailbox attachment a batch entry came from, carried from a sync through to confirmation.
 *
 * **Not the same question as `attachmentId`.** That is a lookup key for one sync's own manifest;
 * this rides on a batch entry across the parse, the bind, the review and the confirm — long after
 * the manifest that produced it is gone — so it repeats `uid` and `part` as plain fields rather than
 * a joined id nothing downstream needs to split back apart.
 */
export type MailboxRef = {
  readonly uid: number;
  readonly part: string;
};

/** One downloaded attachment, paired with the mailbox coordinates that produced it. */
export type MailboxFile = {
  readonly file: File;
  readonly ref: MailboxRef;
};

/**
 * The date to hand IMAP's `since`, from the page's query.
 *
 * `?all=1` means no window at all. `?days=N` bounds it. Anything else — absent, unparseable,
 * negative, absurd — falls back to `DEFAULT_SYNC_DAYS` rather than failing, because this is a
 * convenience parameter on a button and a broken one should narrow the search, never widen it.
 *
 * **There is no "since the last run" here, and that is the one place this deliberately does less
 * than the local fetcher.** The script keeps a state file beside the folder it writes to; a route
 * has neither, and inventing server-side state to hold a watermark would be a new persisted thing
 * for a button pressed by hand. The window is what the owner asks for, defaulting to a month.
 */
export function syncSince(params: URLSearchParams, now: Date = new Date()): Date | null {
  if (params.get("all") === "1") return null;
  const raw = params.get("days");
  const days = raw === null ? Number.NaN : Number(raw);
  const bounded = Number.isFinite(days) && days > 0 && days <= MAX_SYNC_DAYS ? days : DEFAULT_SYNC_DAYS;
  return new Date(now.getTime() - bounded * 86_400_000);
}

/**
 * The manifest for a set of found attachments.
 *
 * **The cap is applied at the IMAP search, not here, and this is the second line of defence.** An
 * earlier version capped only here, which meant the route walked every matching message in the
 * mailbox before discarding most of them — one round trip each, and the page offers "everything
 * the senders ever sent". The slice stays because a policy module that trusts its caller to have
 * already applied the policy is one refactor away from not applying it at all.
 */
export function buildManifest(
  found: readonly SyncAttachment[],
  messages: number,
  since: Date | null,
  truncated = false
): SyncManifest {
  const attachments = found.slice(0, MAX_SYNC_ATTACHMENTS);
  return {
    messages,
    attachments,
    truncated: truncated || found.length > attachments.length,
    since: since === null ? null : since.toISOString().slice(0, 10)
  };
}

/**
 * A stopwatch for a mailbox route's steps, rendered as a `Server-Timing` header.
 *
 * **The mailbox routes are the slow ones, and "slow" was not decomposable from a browser.** An owner
 * route with no mailbox answers in a fraction of a second from the same region; listing or
 * downloading takes several, and a sync repeats that per file. Which step pays for it — sign-in, the
 * IMAP login, the search, the fetch, the download starting — is what this reports, in the response's
 * own timing panel, so a change meant to make it faster can be checked against the step it targets.
 *
 * **Durations and fixed step names only.** A header reaches devtools and anything that captures one,
 * so nothing here may carry an address, a filename or a count from the mailbox.
 */
export function stepTimer(now: () => number = () => performance.now()) {
  const steps: [string, number][] = [];
  let last = now();
  return {
    lap(step: string) {
      const current = now();
      steps.push([step, current - last]);
      last = current;
    },
    header(): string {
      return steps.map(([step, ms]) => `${step};dur=${Math.round(ms)}`).join(", ");
    }
  };
}

/**
 * A `Content-Disposition` value for one attachment, safe for a real bank's filenames.
 *
 * **A Thai filename in a bare `filename="…"` makes the download fail with a server error**, not a
 * mangled name. `safeFileName` strips control and Windows-reserved characters but preserves
 * non-ASCII — correctly, because it is naming a file on disk — and Node refuses to write a header
 * value containing a code point above `\xFF`, so the whole PDF is lost to `ERR_INVALID_CHAR`. The
 * banks this app reads are Thai, so this is the ordinary case rather than an exotic one.
 *
 * So it emits both forms RFC 6266 defines: an ASCII-folded `filename=` that any client can read,
 * and `filename*=UTF-8''…` carrying the real name for anything from this decade. Percent-encoding
 * is done against RFC 5987's `attr-char` set explicitly, because `encodeURIComponent` leaves
 * `!'()*` alone and those are not attr-chars.
 */
export function contentDisposition(name: string): string {
  const folded = name.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/gu, "_").trim();
  const fallback = folded === "" || /^_+$/u.test(folded) ? "statement.pdf" : folded;
  const encoded = [...name].map((char) => {
    const code = char.codePointAt(0) ?? 0;
    return /[A-Za-z0-9!#$&+\-.^_`|~]/u.test(char) && code < 128
      ? char
      : [...new TextEncoder().encode(char)].map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`).join("");
  }).join("");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * A sentence describing what a sync found, for the page to show.
 *
 * **It never claims anything about what is "already imported".** A server has no folder to compare
 * against — the local fetcher skips by filename because it owns the directory it writes to, and
 * this has nothing equivalent. The batch worklist already blocks a repeat on its artifact digest,
 * which is a stronger check than a filename and happens where the bytes actually are, so the honest
 * thing here is to report the mailbox and let the digest do the deduplicating.
 */
export function describeManifest(manifest: SyncManifest): string {
  const { messages, attachments, truncated, since } = manifest;
  const window = since === null ? "" : ` since ${since}`;
  if (attachments.length === 0) {
    // **`truncated` is consulted before this branch, not after it.** Answering "nothing found"
    // without looking was safe only while the attachment cap was the sole way to set the flag,
    // since that cap cannot trip with an empty list. The scanned-message cap can: every message
    // examined was already fetched, so the sync stops early having found nothing new. Reporting
    // that as an empty mailbox is false, and it is the failure the owner can least recover from
    // on his own — the search is newest-first and the window control offers no "older than", so
    // the same wrong sentence would come back on every retry with no way past it.
    // **It must not say "sync again" here, though the non-empty case below rightly does.** There,
    // truncation means attachments were found and confirming them flags their parts, so the next
    // scan skips past and reaches deeper — retrying makes progress. Here nothing was found: the
    // same newest messages are examined again, all of them already fetched, and the answer is
    // identical every time. Telling the owner to retry would leave him pressing a button that
    // cannot change its own outcome.
    if (truncated) {
      return `No new statement mail among the ${MAX_SYNC_MESSAGES_SCANNED} newest messages this sync examined${window} — every one had already been fetched. Older mail is beyond what a single sync reaches, so syncing again reports the same thing.`;
    }
    return since === null
      ? "No statement mail found from the configured senders."
      : `No statement mail since ${since}. Ask for a wider window if one is expected.`;
  }
  // Which cap stopped the search is not recorded, so this names both rather than asserting the
  // one it used to be able to assume.
  const tail = truncated
    ? ` The mailbox holds more — a sync stops at ${MAX_SYNC_ATTACHMENTS} PDFs or ${MAX_SYNC_MESSAGES_SCANNED} messages, so import these and sync again.`
    : "";
  return `${attachments.length} PDF(s) across ${messages} message(s)${window}.${tail}`;
}

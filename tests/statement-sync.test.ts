import { describe, expect, it } from "vitest";
import {
  attachmentId, attachmentPath, buildManifest, contentDisposition, describeManifest, isSafePartPath,
  parseSenders, parseUid, syncSince,
  DEFAULT_SYNC_DAYS, MAX_SYNC_ATTACHMENTS, MAX_SYNC_DAYS,
  type SyncAttachment
} from "@/lib/statement-sync";

/**
 * The hosted Sync button's decisions, none of which need a mailbox to exercise.
 *
 * Every value here is invented, per `docs/FIXTURE_POLICY.md`. What is deliberately not tested is
 * IMAP itself, or `imapflow` — a mock of the library would only assert that the code calls the
 * functions it calls. What *is* tested is everything a browser can influence: the part path, the
 * uid, the window, and what the page is told afterwards.
 */

function attachment(uid: number, part: string, name: string, sizeBytes = 220_000): SyncAttachment {
  return { id: attachmentId(uid, part), uid, part, name, sizeBytes };
}

describe("the senders a deployment will accept mail from", () => {
  it("takes a comma-separated list, which is what a person types into an environment variable", () => {
    expect(parseSenders("a@bank-one.example, b@bank-two.example"))
      .toEqual(["a@bank-one.example", "b@bank-two.example"]);
  });

  it("takes a whitespace-separated list too, including newlines", () => {
    expect(parseSenders("a@bank-one.example\nb@bank-two.example  c@bank-three.example"))
      .toEqual(["a@bank-one.example", "b@bank-two.example", "c@bank-three.example"]);
  });

  it("lower-cases and de-duplicates, so one address never becomes two `or` branches", () => {
    expect(parseSenders("A@Bank-One.Example, a@bank-one.example")).toEqual(["a@bank-one.example"]);
  });

  it("drops anything that is not an address rather than passing it to a mail server", () => {
    // A typo that reaches IMAP comes back as "no mail", which reads exactly like a bank that
    // stopped sending — the one failure this feature must not produce silently.
    expect(parseSenders("not-an-address, real@bank-one.example")).toEqual(["real@bank-one.example"]);
  });

  it("is empty for an unset variable, which is what makes the route answer 503", () => {
    expect(parseSenders(undefined)).toEqual([]);
    expect(parseSenders("")).toEqual([]);
    expect(parseSenders("   ")).toEqual([]);
  });
});

describe("the part path the browser is allowed to name", () => {
  it("takes the dotted digit runs IMAP actually uses", () => {
    expect(isSafePartPath("2")).toBe(true);
    expect(isSafePartPath("1.2")).toBe(true);
    expect(isSafePartPath("1.2.1")).toBe(true);
  });

  it("refuses everything else rather than trying to escape it", () => {
    // A part path is a selector, not a value with a safe encoding: the only correct answer to an
    // unexpected one is no.
    for (const bad of ["", "0", "1.0", "..", ".1", "1.", "1..2", "1 2", "1;2", "TEXT", "1.HEADER",
      "../../etc", "1.2/../3", "-1", "1e3", "١٢", "1.2\n3"]) {
      expect(isSafePartPath(bad), `${JSON.stringify(bad)} must be refused`).toBe(false);
    }
  });
});

describe("the uid the browser is allowed to name", () => {
  it("takes a plain positive integer", () => {
    expect(parseUid("1")).toBe(1);
    expect(parseUid("40213")).toBe(40213);
  });

  it("refuses anything that is not one", () => {
    for (const bad of ["", "0", "-1", "1.5", "1e3", "1 ", " 1", "0x2", "abc", "٢", null, undefined]) {
      expect(parseUid(bad), `${JSON.stringify(bad)} must be refused`).toBeNull();
    }
  });

  it("refuses a value beyond exact integer range rather than rounding it", () => {
    expect(parseUid("9007199254740993")).toBeNull();
  });
});

describe("where the page fetches one attachment's bytes from", () => {
  it("is same-origin and under the versioned api prefix, so the CSP is untouched", () => {
    expect(attachmentPath(42, "1.2")).toMatch(/^\/api\/v1\//u);
    expect(attachmentPath(42, "1.2")).toBe("/api/v1/imports/mailbox/attachment?uid=42&part=1.2");
  });

  it("encodes what it interpolates", () => {
    // `isSafePartPath` should already have refused this. Encoding anyway, because a URL builder
    // that is only safe when its caller checked first is a trap waiting for a second caller.
    expect(attachmentPath(1, "1&x=2")).toBe("/api/v1/imports/mailbox/attachment?uid=1&part=1%26x%3D2");
  });
});

describe("the window a sync asks for", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const params = (query: string) => new URLSearchParams(query);

  it("is a month when nothing says otherwise", () => {
    const since = syncSince(params(""), now);
    expect(since).not.toBeNull();
    expect(Math.round((now.getTime() - (since as Date).getTime()) / 86_400_000)).toBe(DEFAULT_SYNC_DAYS);
  });

  it("takes a day count", () => {
    const since = syncSince(params("days=90"), now);
    expect(Math.round((now.getTime() - (since as Date).getTime()) / 86_400_000)).toBe(90);
  });

  it("is null for `all=1`, which is the only way to ask for everything", () => {
    expect(syncSince(params("all=1"), now)).toBeNull();
    // Not any truthy value: a stray `all=0` must not widen the search.
    expect(syncSince(params("all=0"), now)).not.toBeNull();
  });

  it("narrows rather than widens on anything unparseable", () => {
    // This is a convenience parameter on a button. A broken one must never mean "search the
    // whole mailbox".
    for (const query of ["days=", "days=abc", "days=-5", "days=0", "days=NaN", "days=Infinity",
      `days=${MAX_SYNC_DAYS + 1}`]) {
      const since = syncSince(params(query), now);
      expect(since, query).not.toBeNull();
      expect(Math.round((now.getTime() - (since as Date).getTime()) / 86_400_000), query)
        .toBe(DEFAULT_SYNC_DAYS);
    }
  });
});

describe("the manifest handed to the page", () => {
  it("says there is more without inventing a number for it", () => {
    // **The count is deliberately not knowable.** `findAttachments` stops issuing IMAP round trips
    // once it has enough, so counting the rest would be the unbounded mailbox scan that cap exists
    // to prevent — the flag says what the owner can act on and nothing more.
    const found = Array.from({ length: MAX_SYNC_ATTACHMENTS }, (_, index) =>
      attachment(index + 1, "2", `statement-${index}.pdf`));
    const manifest = buildManifest(found, 12, new Date("2026-08-01T00:00:00.000Z"), true);
    expect(manifest.attachments).toHaveLength(MAX_SYNC_ATTACHMENTS);
    expect(manifest.truncated).toBe(true);
    expect(describeManifest(manifest)).toContain("The mailbox holds more");
    expect(describeManifest(manifest)).toContain("sync again");
  });

  it("still slices, so a caller that forgot the cap cannot overrun it", () => {
    // The cap belongs at the IMAP search and is applied there. This is the second line of defence:
    // a policy module that trusts its caller to have applied the policy is one refactor away from
    // not applying it at all.
    const found = Array.from({ length: MAX_SYNC_ATTACHMENTS + 7 }, (_, index) =>
      attachment(index + 1, "2", `statement-${index}.pdf`));
    const manifest = buildManifest(found, 12, null);
    expect(manifest.attachments).toHaveLength(MAX_SYNC_ATTACHMENTS);
    expect(manifest.truncated, "an over-long list is a truncation even if nobody said so").toBe(true);
  });

  it("says nothing about more mail when everything fit", () => {
    const manifest = buildManifest([attachment(1, "2", "a.pdf")], 1, null);
    expect(manifest.truncated).toBe(false);
    expect(describeManifest(manifest)).not.toContain("holds more");
  });

  it("reports the window as a plain date, and null means everything", () => {
    expect(buildManifest([], 0, new Date("2026-07-24T09:30:00.000Z")).since).toBe("2026-07-24");
    expect(buildManifest([], 0, null).since).toBeNull();
  });

  it("says something useful when the mailbox held nothing", () => {
    expect(describeManifest(buildManifest([], 0, new Date("2026-07-24T00:00:00.000Z"))))
      .toContain("Ask for a wider window");
    expect(describeManifest(buildManifest([], 0, null)))
      .toContain("No statement mail found");
  });

  it("counts PDFs and messages separately, because one mail carries more than one statement", () => {
    // The shape measured against the owner's three banks on 2026-08-23 (D-144): one sender mailed
    // two months in a single message, another mailed a statement alongside an unrelated document.
    const found = [attachment(9, "2", "a.pdf"), attachment(9, "3", "b.pdf"), attachment(8, "2", "c.pdf")];
    expect(describeManifest(buildManifest(found, 2, null))).toBe("3 PDF(s) across 2 message(s).");
  });

  it("never claims a statement is already imported", () => {
    // A server has no folder to compare against — the local fetcher skips by filename because it
    // owns the directory it writes to. The batch worklist blocks a repeat on the PDF's own
    // SHA-256, which is a stronger check in the place where the bytes actually are, so this must
    // not offer a weaker one that sounds authoritative.
    const text = describeManifest(buildManifest([attachment(1, "2", "a.pdf")], 1, null));
    expect(text).not.toMatch(/already|skipped|duplicate|present/iu);
  });
});

describe("the Content-Disposition for a downloaded attachment", () => {
  it("keeps an ASCII name in the plain form", () => {
    expect(contentDisposition("statement-2026-08.pdf"))
      .toContain('filename="statement-2026-08.pdf"');
  });

  it("never puts a non-Latin-1 character in the plain form, because Node refuses the header", () => {
    // **This is the ordinary case, not an exotic one**: the banks this app reads are Thai, and a
    // code point above \xFF in a header value fails the whole download with ERR_INVALID_CHAR
    // rather than arriving with a mangled name.
    const value = contentDisposition("รายการเดินบัญชี.pdf");
    const plain = /filename="([^"]*)"/u.exec(value)?.[1] ?? "";
    expect(plain).toMatch(/^[\x20-\x7e]*$/u);
    for (const char of value) expect(char.codePointAt(0)).toBeLessThan(0x100);
    // The real name still travels, in the form that can carry it.
    expect(value).toContain("filename*=UTF-8''");
    expect(value).toContain("%E0%B8%A3");
  });

  it("percent-encodes the characters `encodeURIComponent` would leave alone", () => {
    // `encodeURIComponent` leaves `!'()*` untouched, and four of those five are **not** RFC 5987
    // attr-chars, so an extended filename built with it is malformed. `!` is the exception — it is
    // a legitimate attr-char, and this test asserted it must be encoded until the implementation
    // disagreed and the spec settled it.
    const value = contentDisposition("a'b(c)d*e!f.pdf");
    const extended = value.split("filename*=UTF-8''")[1] ?? "";
    expect(extended, "the four that are not attr-chars must be encoded").not.toMatch(/['()*]/u);
    expect(extended, "`!` is an attr-char and encoding it would be needless").toContain("!");
  });

  it("never emits an empty or quote-bearing plain filename", () => {
    for (const name of ["", "\"\"", "…", "\\"]) {
      const value = contentDisposition(name);
      const plain = /filename="([^"]*)"/u.exec(value)?.[1] ?? "";
      expect(plain, JSON.stringify(name)).not.toBe("");
      expect(plain, JSON.stringify(name)).not.toMatch(/["\\]/u);
    }
  });
});

describe("an attachment's identity within one sync", () => {
  it("is the uid and the part together, because one message holds several", () => {
    expect(attachmentId(9, "2")).toBe("9.2");
    expect(attachmentId(9, "3")).not.toBe(attachmentId(9, "2"));
    expect(attachmentId(8, "2")).not.toBe(attachmentId(9, "2"));
  });
});

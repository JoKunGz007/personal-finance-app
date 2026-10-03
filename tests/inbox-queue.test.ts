import { describe, expect, it } from "vitest";
import {
  addedLabel, expiredObjects, INBOX_MAX_BYTES, inboxPath, kindOfObject, lineObjectName, lineReceivedAt, planFile, sizeLabel
} from "@/lib/inbox-queue";

/** The Inbox queue's pure rules (D-235). Every name, id and time is invented. */

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("planning a picked file", () => {
  it("uploads PNG, JPEG, WebP and PDF as they are", () => {
    expect(planFile(file("a.png", "image/png"))).toEqual({ action: "upload", contentType: "image/png", extension: "png" });
    expect(planFile(file("a.jpeg", "image/jpeg"))).toEqual({ action: "upload", contentType: "image/jpeg", extension: "jpg" });
    expect(planFile(file("a.webp", "image/webp"))).toEqual({ action: "upload", contentType: "image/webp", extension: "webp" });
    expect(planFile(file("a.pdf", "application/pdf"))).toEqual({ action: "upload", contentType: "application/pdf", extension: "pdf" });
  });

  it("re-encodes any other image to PNG, including one the browser gave no type", () => {
    expect(planFile(file("a.heic", "image/heic"))).toEqual({ action: "reencode", contentType: "image/png", extension: "png" });
    expect(planFile(file("a.HEIC", ""))).toEqual({ action: "reencode", contentType: "image/png", extension: "png" });
    expect(planFile(file("a.gif", "image/gif")).action).toBe("reencode");
  });

  it("falls back to the extension only when there is no type", () => {
    expect(planFile(file("scan.PDF", ""))).toMatchObject({ action: "upload", extension: "pdf" });
    expect(planFile(file("photo.jpg", "application/zip")).action).toBe("refuse");
  });

  it("refuses everything else, an empty file, and one over the bucket's limit", () => {
    expect(planFile(file("a.txt", "text/plain")).action).toBe("refuse");
    expect(planFile(file("noext", "")).action).toBe("refuse");
    expect(planFile(file("a.png", "image/png", 0)).action).toBe("refuse");
    expect(planFile(file("a.pdf", "application/pdf", INBOX_MAX_BYTES + 1)).action).toBe("refuse");
    expect(planFile(file("a.pdf", "application/pdf", INBOX_MAX_BYTES)).action).toBe("upload");
  });
});

describe("naming a stored object", () => {
  it("puts the owner's folder and a random id in the path, never the file name", () => {
    expect(inboxPath("owner-1", "id-1", "jpg")).toBe("owner-1/id-1.jpg");
  });

  it("reads the kind from the extension", () => {
    expect(kindOfObject("x.pdf")).toBe("pdf");
    expect(kindOfObject("x.PNG")).toBe("image");
    expect(kindOfObject("x.jpg")).toBe("image");
    expect(kindOfObject("x.webp")).toBe("image");
    expect(kindOfObject("x.txt")).toBeNull();
    expect(kindOfObject("x")).toBeNull();
  });
});

describe("expiry", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const at = (iso: string | null) => ({ name: "n", created_at: iso });

  it("expires what is more than seven days old and keeps the rest", () => {
    const old = at("2026-10-01T11:59:59Z");
    const edge = at("2026-10-01T12:00:00Z");
    const fresh = at("2026-10-07T12:00:00Z");
    expect(expiredObjects([old, edge, fresh], now)).toEqual([old]);
  });

  it("keeps an object whose time is missing or unreadable", () => {
    expect(expiredObjects([at(null), at("not a date")], now)).toEqual([]);
  });
});

describe("labels", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("says how long ago", () => {
    expect(addedLabel("2026-10-08T11:59:30Z", now)).toBe("just now");
    expect(addedLabel("2026-10-08T11:55:00Z", now)).toBe("5 min ago");
    expect(addedLabel("2026-10-08T09:00:00Z", now)).toBe("3 h ago");
    expect(addedLabel("2026-10-07T11:00:00Z", now)).toBe("1 day ago");
    expect(addedLabel("2026-10-05T11:00:00Z", now)).toBe("3 days ago");
    expect(addedLabel(null, now)).toBe("time unknown");
  });

  it("formats sizes", () => {
    expect(sizeLabel(100)).toBe("1 KB");
    expect(sizeLabel(12 * 1024)).toBe("12 KB");
    expect(sizeLabel(3.4 * 1024 * 1024)).toBe("3.4 MB");
  });
});

describe("LINE queue names (D-241)", () => {
  const iso = "2026-09-30T10:00:00.000Z";
  it("round-trips the receive time", () => {
    const name = lineObjectName(iso, "100001", "image/jpeg");
    expect(name).toBe(`line-${Date.parse(iso)}-100001.jpg`);
    expect(lineReceivedAt(name!)).toBe(iso);
    expect(lineObjectName(iso, "7", "image/png")).toMatch(/\.png$/u);
  });
  it("refuses an unreadable time or a non-digit id", () => {
    expect(lineObjectName("nope", "1", "image/png")).toBeNull();
    expect(lineObjectName(iso, "12ab", "image/png")).toBeNull();
    expect(lineObjectName(iso, "../1", "image/png")).toBeNull();
    expect(lineObjectName(iso, "1".repeat(33), "image/png")).toBeNull();
  });
  it("parses only its own shape", () => {
    for (const name of [
      "a.png", "line-123-1.png", "line-1790762400000-1.webp", "line-1790762400000-1.pdf", "../line-1790762400000-1.png",
      "line-1790762400000-1.png/x", "line-1790762400000-..png", "x/line-1790762400000-1.png", "line-1790762400000-1.png.png"
    ]) expect(lineReceivedAt(name), name).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { INBOX_VIEW_KEY, kindLabel, loadInboxView, parseInboxView, saveInboxView } from "@/lib/inbox-view";

/** The Inbox queue's layout preference: table unless the device clearly says cards. */

const memory = (initial: string | null = null) => {
  let value = initial;
  return {
    getItem: (key: string) => (key === INBOX_VIEW_KEY ? value : null),
    setItem: (key: string, next: string) => { if (key === INBOX_VIEW_KEY) value = next; }
  };
};
const refusing = {
  getItem: () => { throw new Error("storage refused"); },
  setItem: () => { throw new Error("storage refused"); }
};

describe("inbox view preference", () => {
  it("defaults to the table when nothing or garbage is stored", () => {
    expect(parseInboxView(null)).toBe("table");
    expect(parseInboxView(undefined)).toBe("table");
    expect(parseInboxView("")).toBe("table");
    expect(parseInboxView("grid")).toBe("table");
    expect(loadInboxView(memory())).toBe("table");
  });

  it("round-trips both views", () => {
    const store = memory();
    saveInboxView("cards", store);
    expect(loadInboxView(store)).toBe("cards");
    saveInboxView("table", store);
    expect(loadInboxView(store)).toBe("table");
  });

  it("falls back to the table when storage cannot be read, and does not throw on write", () => {
    expect(loadInboxView(refusing)).toBe("table");
    expect(() => saveInboxView("cards", refusing)).not.toThrow();
  });

  it("names the object kinds", () => {
    expect(kindLabel("image")).toBe("Image");
    expect(kindLabel("pdf")).toBe("PDF");
    expect(kindLabel(null)).toBe("File");
  });
});

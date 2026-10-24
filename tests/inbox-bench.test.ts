import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceLine, SyncTable, sourceStatus } from "@/app/inbox-bench";
import { EMPTY_STATEMENT_TOTAL } from "@/lib/browser/mail-sync";
import { REVIEW_LINK_LABEL } from "@/lib/inbox-drain";

describe("the Bank statements line (D-260)", () => {
  const total = {
    ...EMPTY_STATEMENT_TOTAL,
    captured: 1,
    notes: ["s4.pdf: 12 new rows imported, 30 already in the ledger."],
    held: [
      { uid: 5, part: "2", name: "s5.pdf", reason: "This statement needs a look before it is saved.", code: "warnings", reviewHref: "/import?mailbox=5%3A2" },
      { uid: 6, part: "2", name: "s6.pdf", reason: "None of the stored statement passwords opens this PDF.", code: "locked", reviewHref: null }
    ]
  };
  const html = renderToStaticMarkup(createElement(SourceLine, { line: { state: "statements", total } }));

  it("shows the review control as a button with the review address", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = [...doc.querySelectorAll("a")].filter((a) => a.textContent === REVIEW_LINK_LABEL);
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/import?mailbox=5%3A2");
    expect(links[0]!.classList.contains("secondary-button")).toBe(true);
    expect(links[0]!.parentElement!.classList.contains("slip-actions")).toBe(true);
  });

  it("shows each overlap sentence and each held reason", () => {
    expect(html).toContain("s4.pdf: 12 new rows imported, 30 already in the ledger.");
    expect(html).toContain("s5.pdf: This statement needs a look before it is saved.");
    expect(html).toContain("s6.pdf: None of the stored statement passwords opens this PDF.");
  });
});

describe("sourceStatus (PLAN Open item 10)", () => {
  const held = { uid: 5, part: "2", name: "s5.pdf", reason: "Needs a look.", code: "warnings", reviewHref: "/import?mailbox=5%3A2" } as const;
  const statements = (overrides: Partial<typeof EMPTY_STATEMENT_TOTAL>) =>
    sourceStatus({ state: "statements", total: { ...EMPTY_STATEMENT_TOTAL, ...overrides } });

  it("names waiting, running and a clean finish", () => {
    expect(sourceStatus({ state: "waiting" })).toBe("waiting");
    expect(sourceStatus({ state: "running", note: "Reading the mailbox…" })).toBe("running");
    expect(sourceStatus({ state: "done", note: "2 new orders.", error: null })).toBe("done");
    expect(sourceStatus({ state: "done", note: "", error: null })).toBe("done");
  });

  it("calls a finish with an error, a failed source and a statements error Failed", () => {
    expect(sourceStatus({ state: "done", note: "1 new order.", error: "The server answered 504." })).toBe("failed");
    expect(sourceStatus({ state: "failed", error: "Could not be reached." })).toBe("failed");
    expect(statements({ error: "Stopped." })).toBe("failed");
    expect(statements({ error: "Stopped.", held: [held], remaining: 2 })).toBe("failed");
  });

  it("asks for a check when a statement is held or left for the device", () => {
    expect(statements({ captured: 1 })).toBe("done");
    expect(statements({})).toBe("done");
    expect(statements({ held: [held] })).toBe("check");
    expect(statements({ remaining: 1 })).toBe("check");
    expect(statements({ more: true })).toBe("check");
  });
});

describe("SyncTable (PLAN Open item 10)", () => {
  const html = renderToStaticMarkup(createElement(SyncTable, { lines: [
    { state: "done", note: "No new mail.", error: null },
    { state: "failed", error: "Could not be reached." },
    { state: "statements", total: { ...EMPTY_STATEMENT_TOTAL, remaining: 1 } }
  ] }));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("li.sync-row")];

  it("hides the header row from assistive technology", () => {
    expect(doc.querySelector("li.sync-head")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("gives each source its status class, hidden mark and status word", () => {
    expect(rows.map((row) => row.className)).toEqual(["sync-row sync-done", "sync-row sync-failed", "sync-row sync-check"]);
    expect(rows.map((row) => row.querySelector(".sync-mark")!.textContent)).toEqual(["✓", "✕", "!"]);
    expect(rows.every((row) => row.querySelector(".sync-mark")!.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(rows.map((row) => row.querySelector(".sync-status")!.textContent)).toEqual(["Done", "Failed", "Check"]);
    expect(rows[1]!.querySelector('.sync-details [role="alert"]')!.textContent).toBe("Could not be reached.");
  });
});

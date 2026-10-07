import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceLine } from "@/app/inbox-bench";
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

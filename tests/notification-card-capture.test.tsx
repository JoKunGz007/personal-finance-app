import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PLAN Open item 8, finding A1: changing the channel after a card was read and pre-filled must empty
// the form, not only the reading. The reader, the card finder and the pre-fill are replaced; the
// component, the typed form and the capture gate run for real. Every value here is invented.

vi.mock("@/lib/browser/ocr-reader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/browser/ocr-reader")>()),
  encodeForReader: async () => ({ invented: true }),
  readImageWords: async () => ({ ok: true, words: [] })
}));
vi.mock("@/lib/notification-card-ocr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notification-card-ocr")>()),
  findCards: () => [{ direction: "out", words: [] }],
  locateCardFields: () => ({})
}));
vi.mock("@/lib/notification-card-prefill", async (importOriginal) => {
  const { bangkokToday } = await import("@/lib/dates");
  return {
    ...(await importOriginal<typeof import("@/lib/notification-card-prefill")>()),
    prefillCardFields: () => ({
      amount: { ok: true, value: { magnitude: "250.00", sign: "-" } },
      balance: { ok: true, value: "9310.00" },
      ownAccount: { ok: true, value: "1234" },
      occurredAt: { ok: true, value: { date: bangkokToday(), time: "09:15" } }
    })
  };
});
vi.mock("@/app/result-banner", () => ({ useResultBanner: () => ({ anchor: { current: null }, reveal: () => {} }) }));
vi.mock("@/app/ledger-note", () => ({ LedgerNote: () => null }));

import { NotificationCardCapture } from "@/app/notification-card-capture";

// Both accounts print the same last four, and both banks mask the last four, so the pre-filled digits
// bind under either channel: the form stays submittable after the switch unless it is emptied.
const ACCOUNTS = [
  { id: "00000000-0000-4000-8000-0000000000a1", bank_code: "SCB", label: "Invented SCB", last_four: "1234" },
  { id: "00000000-0000-4000-8000-0000000000a2", bank_code: "KTB", label: "Invented KTB", last_four: "1234" }
];

describe("NotificationCardCapture channel change (Open item 8, A1)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("createImageBitmap", async () => ({ width: 100, height: 100 }));
    vi.stubGlobal("fetch", async (url: string) => new Response(
      JSON.stringify(url.includes("accounts") ? { accounts: ACCOUNTS } : { categories: [] }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const labelled = <T extends Element>(text: string) =>
    [...container.querySelectorAll("label")].find((l) => l.querySelector("span")?.textContent === text)!.querySelector<T>("input, select")!;
  const submit = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Capture this card")!;

  it("empties the pre-filled boxes and disables Capture when the channel changes", async () => {
    await act(async () => root.render(createElement(NotificationCardCapture)));
    await act(async () => {
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Capture a notification card")!.click();
    });

    const channel = labelled<HTMLSelectElement>("Which channel");
    await act(async () => {
      channel.value = "SCB Connect";
      channel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const file = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(file, "files", { value: [new File([new Uint8Array([1])], "invented.png", { type: "image/png" })], configurable: true });
    await act(async () => { file.dispatchEvent(new Event("change", { bubbles: true })); });

    // The read pre-filled the form. Capture is still disabled here: the invented card has no words,
    // so the direction cross-check has nothing to agree with. Dropping the reading (the channel
    // change) is what removes that second signal, so the gate then rests on the boxes alone.
    expect(submit().disabled).toBe(true);
    expect(labelled<HTMLInputElement>("Amount (THB)").value).toBe("250.00");
    expect(labelled<HTMLSelectElement>("Direction").value).toBe("out");
    expect(labelled<HTMLInputElement>("Account digits as printed").value).toBe("1234");
    expect(container.textContent).toContain("The card pre-filled");

    await act(async () => {
      channel.value = "Krungthai Connext";
      channel.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(submit().disabled).toBe(true);
    expect(labelled<HTMLInputElement>("Amount (THB)").value).toBe("");
    expect(labelled<HTMLSelectElement>("Direction").value).toBe("");
    expect(labelled<HTMLInputElement>("Balance after (THB)").value).toBe("");
    expect(labelled<HTMLInputElement>("Account digits as printed").value).toBe("");
    expect(labelled<HTMLInputElement>("Time").value).toBe("");
    expect(container.textContent).not.toContain("The card pre-filled");
  });
});

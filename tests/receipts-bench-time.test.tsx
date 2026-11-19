import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A header time that alone disagrees with the R# time is read again on the bench, as in the Inbox
// (review finding 1). Every value is invented; the screenshot reader is stubbed.

const mocks = vi.hoisted(() => ({
  readImageFileWords: vi.fn(),
  resolveHeaderTime: vi.fn(),
  readScreenshotReceipt: vi.fn(),
  postReceiptCapture: vi.fn()
}));
const BOX = { left: 1, top: 2, right: 3, bottom: 4 };
vi.mock("@/lib/browser/ocr-reader", () => ({ readImageFileWords: mocks.readImageFileWords }));
vi.mock("@/lib/browser/header-time", () => ({ resolveHeaderTime: mocks.resolveHeaderTime }));
vi.mock("@/lib/browser/capture-client", () => ({ postReceiptCapture: mocks.postReceiptCapture }));
vi.mock("@/lib/browser/receipt-reader", () => ({ readReceiptPdf: vi.fn() }));
vi.mock("@/lib/browser/mail-sync", () => ({ describeSevenElevenOutcome: vi.fn(), describeSevenElevenProgress: vi.fn(), syncSevenElevenMail: vi.fn() }));
vi.mock("@/app/ledger-match-panel", () => ({ LedgerMatchPanel: () => null }));
vi.mock("@/app/receipt-statistics", () => ({ ReceiptStatisticsPanel: () => null }));
vi.mock("@/app/use-bench-list", () => ({ useBenchList: () => ({ data: null, busy: false, error: null, signInNote: null, load: vi.fn() }) }));
vi.mock("@/lib/receipt-screenshot", () => ({
  readScreenshotPage: () => ({ ok: true, value: { storeCode: "99999", receiptNumber: "1", headerTimeBox: BOX } }),
  groupScreenshotPages: (pages: unknown[]) => [pages],
  readScreenshotReceipt: mocks.readScreenshotReceipt
}));

import { ReceiptsBench } from "@/app/receipts-bench";

describe("ReceiptsBench disputed header time", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.readImageFileWords.mockResolvedValue({ ok: true, words: [] });
    mocks.readScreenshotReceipt.mockImplementation((_pages: unknown, answer?: string | null) => answer === undefined
      ? { ok: false, code: "TIME_DISPUTED", message: "DISPUTED" }
      : { ok: false, code: "UNREADABLE", message: `reread:${String(answer)}` });
    await act(async () => root.render(createElement(ReceiptsBench)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const pick = async () => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "shot.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    return file;
  };

  it("reads the first page's header time box again and passes the answer on", async () => {
    mocks.resolveHeaderTime.mockResolvedValue({ ok: true, answer: "14:35" });
    const file = await pick();
    expect(mocks.resolveHeaderTime).toHaveBeenCalledWith(file, BOX);
    expect(mocks.readScreenshotReceipt).toHaveBeenLastCalledWith(expect.anything(), "14:35");
    expect(container.textContent).toContain("reread:14:35");
    expect(container.textContent).not.toContain("DISPUTED");
  });

  it("saves a blank-time receipt with its two candidates", async () => {
    const receipt = { purchasedAt: "2026-06-01", purchasedAtTime: null, branchName: "Invented", items: [], netMinor: "3500" };
    mocks.resolveHeaderTime.mockResolvedValue({ ok: true, answer: "09:00" });
    mocks.readScreenshotReceipt.mockImplementation((_pages: unknown, answer?: string | null) => answer === undefined
      ? { ok: false, code: "TIME_DISPUTED", message: "DISPUTED" }
      : { ok: true, value: { ...receipt, completeness: "complete" }, timeCandidates: ["14:35", "09:00"] });
    mocks.postReceiptCapture.mockResolvedValue({ ok: true, data: { captured: true } });
    await pick();
    const save = [...container.querySelectorAll("button")].find((button) => button.textContent === "Save") as HTMLButtonElement;
    await act(async () => { save.click(); });
    expect(mocks.postReceiptCapture).toHaveBeenCalledWith("screenshot", expect.objectContaining({ purchasedAtTime: null }), ["14:35", "09:00"]);
  });

  it("shows a failed re-read as the refusal and does not read the receipt with a blank time", async () => {
    mocks.resolveHeaderTime.mockResolvedValue({ ok: false, why: "The reader could not be reached." });
    await pick();
    expect(mocks.readScreenshotReceipt).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("The reader could not be reached.");
  });
});

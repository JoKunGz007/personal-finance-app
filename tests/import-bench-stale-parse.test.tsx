import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticImport } from "@/lib/synthetic";

// A parse still in flight when the owner opens another statement must not install itself over it.
// Every value is invented.

const reader = vi.hoisted(() => ({ readStatementPdf: vi.fn() }));
vi.mock("@/lib/browser/statement-reader", () => reader);

import { ImportBench } from "@/app/import-bench";

describe("ImportBench stale parse", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = String(url).includes("/demo") ? syntheticImport : { accounts: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const status = () => container.querySelector(".status-line")?.textContent ?? "";
  const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === text)!;

  it("keeps the synthetic statement when a slower parse finishes after it", async () => {
    let finish!: (value: unknown) => void;
    reader.readStatementPdf.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await act(async () => root.render(createElement(ImportBench)));

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const pdf = new File([new Uint8Array([1, 2, 3])], "invented.pdf", { type: "application/pdf" });
    // jsdom's File has no arrayBuffer().
    Object.defineProperty(pdf, "arrayBuffer", { value: async () => new ArrayBuffer(3) });
    Object.defineProperty(fileInput, "files", { value: [pdf], configurable: true });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); });

    const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(password, "invented-password");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => { button("Unlock & check layout").click(); });
    expect(reader.readStatementPdf).toHaveBeenCalledTimes(1);

    await act(async () => { button("Use synthetic statement").click(); });
    expect(status()).toContain("Synthetic statement ready");

    await act(async () => {
      finish({
        ok: true,
        digest: "invented-digest",
        reply: {
          type: "parsed", pageCount: 1, rows: [], valueLabels: [],
          frame: { bankCode: "KTB", accountLastFour: "0000", periodStart: "2026-01-01", periodEnd: "2026-01-31", crossChecked: true }
        }
      });
    });
    expect(status()).toContain("Synthetic statement ready");
    expect(status()).not.toContain("Read 0 rows");
  });
});

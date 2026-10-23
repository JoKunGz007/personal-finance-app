import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { slipHref, SLIP_LINK_LABEL, REVIEW_LINK_LABEL } from "@/lib/inbox-drain";
import { isInboxImageName } from "@/lib/inbox-queue";
import { INBOX_SLIP_BAD_NAME, INBOX_SLIP_GONE, INBOX_SLIP_NOT_REMOVED, INBOX_SLIP_REMOVED } from "@/lib/browser/inbox-slip";

// D-261: a queued slip that needs checking opens on the Slips page and leaves the Inbox after a capture.
// Every name, reference and amount here is invented.

const UPLOADED = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.png";
const LINE = "line-1790000000000-123456789.jpg";

// A fake Storage client: what the page downloads and removes, and what removal answers.
const storage = {
  downloads: [] as string[],
  removed: [] as string[][],
  downloadMissing: false,
  removeFails: false
};
vi.mock("@/lib/browser/supabase", () => ({
  browserSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-uid" } } }) },
    storage: {
      from: () => ({
        download: async (path: string) => {
          storage.downloads.push(path);
          return storage.downloadMissing
            ? { data: null, error: { message: "Object not found" } }
            : { data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), error: null };
        },
        remove: async (paths: string[]) => {
          storage.removed.push(paths);
          return storage.removeFails ? { data: null, error: { message: "network" } } : { data: paths.map((name) => ({ name })), error: null };
        }
      })
    }
  })
}));
vi.mock("@/lib/browser/qr-detector", () => ({ resolveDetector: async () => ({}), detectAtScale: async () => [] }));
vi.mock("@/lib/slip-scan", () => ({
  scanForSlipIdentity: async () => ({
    ok: true, identity: { bankCode: "KBANK", bankQrCode: "004", reference: "INVENTEDREF0001" }, payload: "invented-payload", scale: 1, candidates: 1
  })
}));
// The reader: what the whole slip read as, and what the amount's enlarged box read as (D-259).
const reader = {
  full: [] as Array<{ text: string; left: number; right: number; top: number; bottom: number }>,
  box: [] as Array<{ text: string; left: number; right: number; top: number; bottom: number }>,
  boxCalls: [] as number[]
};
vi.mock("@/lib/browser/ocr-reader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/browser/ocr-reader")>()),
  encodeForReader: async () => ({ invented: true }),
  readImageWords: async () => ({ ok: true, words: reader.full })
}));
vi.mock("@/lib/browser/year-reread", () => ({
  rereadBox: async (_file: Blob, _box: unknown, crop: { scale: number }) => {
    reader.boxCalls.push(crop.scale);
    return { ok: true, words: reader.box };
  }
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) =>
    createElement("a", { href, className }, children as never)
}));

describe("the Add on Slips button (D-261)", () => {
  it("renders for a slip that needs checking, with the encoded address", async () => {
    const { QueueActions } = await import("@/app/inbox-files");
    const html = renderToStaticMarkup(createElement(QueueActions, { name: LINE, review: false, slip: true, busy: false, onRemove: () => {} }));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = [...doc.querySelectorAll("a")].filter((a) => a.textContent === SLIP_LINK_LABEL);
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe(`/slips?inbox=${encodeURIComponent(LINE)}`);
    expect(links[0]!.classList.contains("secondary-button")).toBe(true);
  });

  it("does not render for any other row", async () => {
    const { QueueActions } = await import("@/app/inbox-files");
    for (const review of [false, true]) {
      const html = renderToStaticMarkup(createElement(QueueActions, { name: UPLOADED, review, slip: false, busy: false, onRemove: () => {} }));
      expect(html).not.toContain(SLIP_LINK_LABEL);
      expect(html.includes(REVIEW_LINK_LABEL)).toBe(review);
    }
  });

  it("encodes the name in the address", () => {
    expect(slipHref("a b&c.png")).toBe("/slips?inbox=a%20b%26c.png");
  });
});

describe("the inbox name the Slips page accepts", () => {
  it("accepts a queued upload's image name and a LINE image name", () => {
    expect(isInboxImageName(UPLOADED)).toBe(true);
    expect(isInboxImageName(UPLOADED.replace(".png", ".jpg"))).toBe(true);
    expect(isInboxImageName(UPLOADED.replace(".png", ".webp"))).toBe(true);
    expect(isInboxImageName(LINE)).toBe(true);
  });

  it("refuses traversal, folders, statements and anything else", () => {
    for (const name of [
      "", "../x.png", `../${UPLOADED}`, `owner-uid/${UPLOADED}`, `${UPLOADED}/..`, "..%2Fx.png",
      UPLOADED.replace(".png", ".pdf"), UPLOADED.toUpperCase(), `${UPLOADED}\n`, "line-1-2.jpg", "line-1790000000000-12a.jpg"
    ]) {
      expect(isInboxImageName(name), name).toBe(false);
    }
  });
});

describe("a queued slip on the Slips page (D-261)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let posts: unknown[];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storage.downloads = [];
    storage.removed = [];
    storage.downloadMissing = false;
    storage.removeFails = false;
    posts = [];
    vi.stubGlobal("createImageBitmap", async () => ({ width: 10, height: 10, close: () => {} }));
    URL.createObjectURL = () => "blob:invented";
    URL.revokeObjectURL = () => {};
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url === "/api/v1/slips" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ captured: true }), { status: 201 });
      }
      return new Response(JSON.stringify({ categories: [] }), { status: 200 });
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  async function open(name: string) {
    window.history.replaceState(null, "", `/slips?inbox=${encodeURIComponent(name)}`);
    const { SlipCapture } = await import("@/app/slip-capture");
    await act(async () => root.render(createElement(SlipCapture)));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }

  async function captureAmount(value: string) {
    const input = container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    expect(input, "the slip form must be open").not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }

  it("opens the queued image as if picked, and removes it after the capture", async () => {
    await open(UPLOADED);
    expect(storage.downloads).toEqual([`owner-uid/${UPLOADED}`]);
    expect(storage.removed).toEqual([]);
    await captureAmount("125.50");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ slipReference: "INVENTEDREF0001", amountMinor: "-12550" });
    expect(storage.removed).toEqual([[`owner-uid/${UPLOADED}`]]);
    expect(container.textContent).toContain(INBOX_SLIP_REMOVED);
    expect(container.querySelector('a[href="/inbox"]')).not.toBeNull();
  });

  // KBANK (the mocked scan) prints the figure on the line below its label. All values invented.
  const kbank = (figure: string) => [
    { text: "จำนวน:", left: 10, right: 90, top: 100, bottom: 120 },
    { text: figure, left: 10, right: 90, top: 140, bottom: 160 }
  ];
  const amountInput = () => container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
  async function pressRead() {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Read the amount")!;
    expect(button, "the read button must be present").not.toBeUndefined();
    await act(async () => { button.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }

  it("reads a refused figure again from the enlarged box and fills the amount (D-259)", async () => {
    reader.full = kbank("23,00");
    reader.box = kbank("23.00");
    reader.boxCalls = [];
    await open(UPLOADED);
    await pressRead();
    expect(reader.boxCalls).toEqual([2]);
    expect(amountInput().value).toBe("23.00");
  });

  it("leaves the amount empty and says why when the enlarged box is refused too", async () => {
    reader.full = kbank("23,00");
    reader.box = kbank("23,00");
    reader.boxCalls = [];
    await open(UPLOADED);
    await pressRead();
    expect(reader.boxCalls).toEqual([2, 3]);
    expect(amountInput().value).toBe("");
    expect(container.textContent).toMatch(/does not read as a plain amount/u);
  });

  it("says the slip is saved when its removal fails", async () => {
    storage.removeFails = true;
    await open(UPLOADED);
    await captureAmount("125.50");
    expect(posts).toHaveLength(1);
    expect(container.textContent).toContain(INBOX_SLIP_NOT_REMOVED);
    expect(container.textContent).not.toContain(INBOX_SLIP_REMOVED);
  });

  it("keeps the queued file when the capture is refused", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      url === "/api/v1/slips" && init?.method === "POST"
        ? new Response(JSON.stringify({ error: "Invented refusal." }), { status: 400 })
        : new Response(JSON.stringify({ categories: [] }), { status: 200 }));
    await open(UPLOADED);
    await captureAmount("125.50");
    expect(storage.removed).toEqual([]);
  });

  it("says plainly when the queued file is gone, and refuses a bad name without a download", async () => {
    storage.downloadMissing = true;
    await open(UPLOADED);
    expect(container.textContent).toContain(INBOX_SLIP_GONE);

    await act(async () => root.unmount());
    root = createRoot(container);
    await open("../other-owner/x.png");
    expect(storage.downloads).toEqual([`owner-uid/${UPLOADED}`]);
    expect(container.textContent).toContain(INBOX_SLIP_BAD_NAME);
  });
});

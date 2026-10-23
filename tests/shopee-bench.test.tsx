import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopeeView } from "@/lib/shopee-view";
import type { WireResult } from "@/lib/wire";

// D-302: a refused Shopee write reads as "Not saved", not as a list that failed to load. Every value
// here is invented.

const client = vi.hoisted(() => ({
  getShopeeView: vi.fn(),
  postShopeeMatch: vi.fn(),
  postShopeeLinks: vi.fn()
}));
vi.mock("@/lib/browser/shopee-client", () => client);

import { ShopeeBench } from "@/app/shopee-bench";

const ORDER = "00000000-0000-4000-8000-000000000001";
const ROW = "00000000-0000-4000-8000-000000000002";

const view: ShopeeView = {
  summary: { months: [] },
  orders: [{
    id: ORDER, orderCode: "TESTORDER1", linkId: "1", orderUrl: "https://example.test/order/1",
    placedAt: "2026-01-05T03:00:00+00:00", paidAt: null, shop: "Invented Shop", paymentMethod: "Invented Pay",
    paymentKind: "bank_debit", totalMinor: "12300", items: [], priceLines: [], refunds: [],
    match: { state: "none", transactionId: null, revision: 0 }
  }],
  rows: { [ROW]: { id: ROW, date: "2026-01-09", time: null, label: null, description: "Invented deposit", movement: "12300" } },
  combined: [], walletTopups: [], spaylaterRepayments: [],
  refundDeposits: [{ orderId: ORDER, transactionId: ROW }],
  links: []
};

describe("ShopeeBench save errors (D-302)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    client.getShopeeView.mockResolvedValue({ ok: true, data: view } satisfies WireResult<ShopeeView>);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const alerts = () => [...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent);
  const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === text)!;

  it("shows a refused link under Not saved after the reload, and Reload clears it", async () => {
    client.postShopeeLinks.mockResolvedValue({ ok: false, kind: "refused", why: "Someone else changed it.", status: 409 });
    await act(async () => root.render(createElement(ShopeeBench)));
    expect(client.getShopeeView).toHaveBeenCalledTimes(1);

    await act(async () => button("Match deposit").click());
    expect(client.getShopeeView).toHaveBeenCalledTimes(2);
    expect(alerts()).toEqual(["Not savedSomeone else changed it.Dismiss"]);

    await act(async () => button("Reload").click());
    expect(alerts()).toEqual([]);
  });

  it("shows Not saved as a bar until Dismiss removes it", async () => {
    client.postShopeeLinks.mockResolvedValue({ ok: false, kind: "refused", why: "Someone else changed it.", status: 409 });
    await act(async () => root.render(createElement(ShopeeBench)));

    await act(async () => button("Match deposit").click());
    expect(alerts()).toEqual(["Not savedSomeone else changed it.Dismiss"]);
    expect(container.querySelector('[role="alert"]')?.classList.contains("save-toast")).toBe(true);

    await act(async () => button("Dismiss").click());
    expect(alerts()).toEqual([]);
  });

  it("keeps Not loaded for a reload that fails after a write that succeeded", async () => {
    client.postShopeeLinks.mockResolvedValue({ ok: true, data: {} });
    await act(async () => root.render(createElement(ShopeeBench)));

    client.getShopeeView.mockResolvedValue({ ok: false, kind: "refused", why: "Broke.", status: 500 });
    await act(async () => button("Match deposit").click());
    expect(alerts()).toEqual(["Not loadedBroke."]);
  });
});

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptStatisticsPanel } from "@/app/receipt-statistics";
import type { ReceiptStatistics } from "@/lib/receipt-statistics";

// Render coverage for the receipt statistics panel on useBenchList (D-302). Every value is invented;
// amounts are minor-unit strings, as the API returns them.

const stats: ReceiptStatistics = {
  totals: {
    receipts: 4, net: "123456", averageNet: { quotient: "30864", remainder: "0" },
    firstDate: "2026-01-05", lastDate: "2026-03-20", partialReceipts: 1, units: 9,
    itemSpend: "130000", discounts: "6544"
  },
  months: [{ month: "2026-01", receipts: 4, net: "123456" }],
  mostBought: [{ name: "Invented Oat Biscuit", quantity: 5, spend: "25000", receipts: 2 }],
  mostSpent: [{ name: "Invented Tea Tin", quantity: 1, spend: "45000", receipts: 1 }],
  paymentMethods: [{ method: "Invented Card", receipts: 4, net: "123456" }],
  branches: [{ storeCode: "T001", branchName: "Invented Branch", receipts: 4, net: "123456" }]
};

function answer(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("ReceiptStatisticsPanel (D-302)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const alerts = () => [...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent);

  it("renders the figures of a successful load", async () => {
    const fetchMock = answer(200, stats);
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(ReceiptStatisticsPanel, { saves: 0 })));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/receipts/statistics");
    const text = container.textContent ?? "";
    expect(text).toContain("Average receipt");
    expect(text).toContain("฿1,234.56");
    expect(text).toContain("Invented Oat Biscuit");
    expect(text).toContain("Invented Card");
    expect(alerts()).toEqual([]);
  });

  it("shows the alert and no figures when the load is refused", async () => {
    vi.stubGlobal("fetch", answer(500, { error: "Invented failure." }));
    await act(async () => root.render(createElement(ReceiptStatisticsPanel, { saves: 0 })));

    expect(alerts()).toEqual(["Not loadedInvented failure."]);
    const text = container.textContent ?? "";
    expect(text).not.toContain("฿");
    expect(text).not.toContain("Average receipt");
    expect(container.querySelector("dl")).toBeNull();
  });
});

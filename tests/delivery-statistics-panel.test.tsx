import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryStatisticsPanel } from "@/app/delivery-statistics";
import type { DeliveryStatistics } from "@/lib/delivery-statistics";

// Render coverage for the delivery statistics panel on useBenchList (D-302). Every value is invented;
// amounts are minor-unit strings, as the API returns them.

const stats: DeliveryStatistics = {
  totals: {
    orders: 7, spent: "123456", averageSpent: { quotient: "17636", remainder: "4" },
    firstDate: "2026-01-05", lastDate: "2026-03-20", deliveryFees: "34500", discounts: "5000",
    schemeOrders: 2, schemePaid: "8800"
  },
  platforms: [{ platform: "grabfood", orders: 7, spent: "123456" }],
  restaurants: [{ restaurant: "Invented Noodle House", orders: 3, spent: "70000" }],
  months: [{ month: "2026-01", orders: 7, spent: "123456", rides: 1, rideSpent: "9900" }],
  rides: { rides: 1, spent: "9900", averageSpent: { quotient: "9900", remainder: "0" }, platformFees: "1100" },
  rideTypes: [{ rideType: "Invented Bike", rides: 1, spent: "9900" }]
};

function answer(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("DeliveryStatisticsPanel (D-302)", () => {
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
    await act(async () => root.render(createElement(DeliveryStatisticsPanel, { changes: 0 })));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/deliveries/statistics");
    const text = container.textContent ?? "";
    expect(text).toContain("Cost you");
    expect(text).toContain("฿1,234.56");
    expect(text).toContain("Invented Noodle House");
    expect(text).toContain("Invented Bike");
    expect(alerts()).toEqual([]);
  });

  it("shows the alert and no figures when the load is refused", async () => {
    vi.stubGlobal("fetch", answer(500, { error: "Invented failure." }));
    await act(async () => root.render(createElement(DeliveryStatisticsPanel, { changes: 0 })));

    expect(alerts()).toEqual(["Not loadedInvented failure."]);
    const text = container.textContent ?? "";
    expect(text).not.toContain("฿");
    expect(text).not.toContain("Cost you");
    expect(container.querySelector("dl")).toBeNull();
  });
});

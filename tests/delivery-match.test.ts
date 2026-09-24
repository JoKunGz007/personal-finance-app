import { describe, expect, it } from "vitest";
import {
  DELIVERY_MATCH_WINDOW_MINUTES,
  deliveryMatchRequestSchema,
  proposeDeliveryMatches,
  proposeGrabMatches,
  qualifiesAutomatically,
  rideQualifiesAutomatically,
  type RideLedgerCandidate,
  type DeliveryLedgerCandidate,
  type DeliveryMatchDecision,
  type DeliveryMatchState
} from "@/lib/delivery-match";
import { deliveriesOnRows, type StoredDelivery } from "@/lib/deliveries";

// Every id and value here is invented.
const D1 = "dddddddd-0000-4000-8000-000000000001";
const D2 = "dddddddd-0000-4000-8000-000000000002";
const FREE = "dddddddd-0000-4000-8000-000000000003";
const T1 = "eeeeeeee-0000-4000-8000-000000000001";
const T2 = "eeeeeeee-0000-4000-8000-000000000002";
const ACCOUNT = "ffffffff-0000-4000-8000-000000000001";

function candidate(delivery: string, transaction: string, lag: number | null, grab = true): DeliveryLedgerCandidate {
  return {
    delivery_id: delivery,
    transaction_id: transaction,
    account_id: ACCOUNT,
    source_date: "2026-09-01",
    source_time: "19:00:00",
    transaction_label: "Card payment",
    description: grab ? "INVENTED GRAB MERCHANT" : "Invented other merchant",
    lag_minutes: lag,
    names_grab: grab
  };
}

const paid = (id: string) => ({ id, paidOutside: false });
const decision = (delivery: string, transaction: string | null, revision = 1): DeliveryMatchDecision =>
  ({ delivery_id: delivery, decision: transaction ? "matched" : "unmatched", transaction_id: transaction, revision });

describe("the automatic rule for one candidate", () => {
  it("takes a GRAB row at or before the e-receipt, inside the window", () => {
    expect(qualifiesAutomatically({ names_grab: true, lag_minutes: 0 })).toBe(true);
    expect(qualifiesAutomatically({ names_grab: true, lag_minutes: -35 })).toBe(true);
    expect(qualifiesAutomatically({ names_grab: true, lag_minutes: -DELIVERY_MATCH_WINDOW_MINUTES })).toBe(true);
  });

  it("refuses a row after the e-receipt, past the window, without a time, or not naming GRAB", () => {
    expect(qualifiesAutomatically({ names_grab: true, lag_minutes: 1 })).toBe(false);
    expect(qualifiesAutomatically({ names_grab: true, lag_minutes: -DELIVERY_MATCH_WINDOW_MINUTES - 1 })).toBe(false);
    expect(qualifiesAutomatically({ names_grab: true, lag_minutes: null })).toBe(false);
    expect(qualifiesAutomatically({ names_grab: false, lag_minutes: -5 })).toBe(false);
  });

  it("is the chosen two hours", () => {
    expect(DELIVERY_MATCH_WINDOW_MINUTES).toBe(120);
  });
});

describe("proposeDeliveryMatches", () => {
  it("matches an order with exactly one qualifying row", () => {
    const states = proposeDeliveryMatches([paid(D1)], [candidate(D1, T1, -8)], []);
    expect(states.get(D1)).toMatchObject({ status: "matched", row: { transaction_id: T1 }, revision: 0 });
  });

  it("refuses two qualifying rows for one order", () => {
    const states = proposeDeliveryMatches([paid(D1)], [candidate(D1, T1, -8), candidate(D1, T2, -20)], []);
    expect(states.get(D1)).toMatchObject({ status: "ambiguous", row: null });
    expect(states.get(D1)!.options).toHaveLength(2);
  });

  // The planted-order case: a second order of the same total wanting the same row takes nothing
  // from the first; both are refused until the owner links one.
  it("refuses a row two orders both want", () => {
    const states = proposeDeliveryMatches([paid(D1), paid(D2)], [candidate(D1, T1, -8), candidate(D2, T1, -3)], []);
    expect(states.get(D1)!.status).toBe("ambiguous");
    expect(states.get(D2)!.status).toBe("ambiguous");
  });

  it("offers a non-GRAB row of the same amount for a manual link but never matches it", () => {
    const states = proposeDeliveryMatches([paid(D1)], [candidate(D1, T1, -8, false)], []);
    expect(states.get(D1)).toMatchObject({ status: "none", row: null });
    expect(states.get(D1)!.options.map((row) => row.transaction_id)).toEqual([T1]);
  });

  it("lets the owner's decision win, and takes its row off every other order", () => {
    const states = proposeDeliveryMatches(
      [paid(D1), paid(D2)],
      [candidate(D1, T1, -8), candidate(D2, T1, -3)],
      [decision(D2, T1, 2)]
    );
    expect(states.get(D2)).toMatchObject({ status: "linked", row: { transaction_id: T1 }, revision: 2 });
    expect(states.get(D1)).toMatchObject({ status: "none", options: [] });
  });

  it("keeps a decline", () => {
    const states = proposeDeliveryMatches([paid(D1)], [candidate(D1, T1, -8)], [decision(D1, null)]);
    expect(states.get(D1)).toMatchObject({ status: "declined", row: null });
  });

  it("never matches a ฿0 order, even with a candidate or a decision in hand", () => {
    const states = proposeDeliveryMatches(
      [{ id: FREE, paidOutside: true }, paid(D1)],
      [candidate(FREE, T1, -2), candidate(D1, T1, -8)],
      [decision(FREE, T2)]
    );
    expect(states.get(FREE)).toEqual({ status: "outside", row: null, options: [], revision: 0 });
    // The ฿0 order's candidate and decision are dropped, so they neither claim nor contest T1.
    expect(states.get(D1)).toMatchObject({ status: "matched", row: { transaction_id: T1 } });
  });

  it("does not depend on the order candidates arrive in", () => {
    const forward = proposeDeliveryMatches([paid(D1), paid(D2)], [candidate(D1, T1, -8), candidate(D2, T2, -3)], []);
    const reverse = proposeDeliveryMatches([paid(D2), paid(D1)], [candidate(D2, T2, -3), candidate(D1, T1, -8)], []);
    expect(reverse.get(D1)).toEqual(forward.get(D1));
    expect(reverse.get(D2)).toEqual(forward.get(D2));
  });
});

describe("deliveryMatchRequestSchema", () => {
  it("requires a row for a link and none for a decline", () => {
    expect(deliveryMatchRequestSchema.safeParse({ expectedRevision: 0, decision: "matched", transactionId: T1 }).success).toBe(true);
    expect(deliveryMatchRequestSchema.safeParse({ expectedRevision: 0, decision: "unmatched", transactionId: null }).success).toBe(true);
    expect(deliveryMatchRequestSchema.safeParse({ expectedRevision: 0, decision: "matched", transactionId: null }).success).toBe(false);
    expect(deliveryMatchRequestSchema.safeParse({ expectedRevision: 0, decision: "unmatched", transactionId: T1 }).success).toBe(false);
  });
});

describe("deliveriesOnRows", () => {
  const stored = (id: string, match: DeliveryMatchState) => ({ id, match }) as unknown as StoredDelivery;
  const row = { transaction_id: T1, source_date: "2026-09-01", source_time: "19:02:00", transaction_label: "Card payment", description: "INVENTED GRAB MERCHANT", lag_minutes: -8 };

  it("keys matched and linked orders by their ledger row, and nothing else", () => {
    const pairs = deliveriesOnRows([
      stored(D1, { status: "matched", row, options: [], revision: 0 }),
      stored(D2, { status: "linked", row: { ...row, transaction_id: T2 }, options: [], revision: 1 }),
      stored(FREE, { status: "outside", row: null, options: [], revision: 0 }),
      stored("dddddddd-0000-4000-8000-000000000004", { status: "ambiguous", row: null, options: [row], revision: 0 }),
      // A link to a row outside the candidate read's three days carries no row, so it cannot be placed.
      stored("dddddddd-0000-4000-8000-000000000005", { status: "linked", row: null, options: [], revision: 1 })
    ]);
    expect(pairs.map(([transaction, delivery]) => [transaction, delivery.id])).toEqual([[T1, D1], [T2, D2]]);
  });
});

describe("orders and rides decided together (D-222)", () => {
  const R1 = "cccccccc-0000-4000-8000-000000000001";
  const rideCandidate = (ride: string, transaction: string, lag: number | null): RideLedgerCandidate => {
    const rest: Partial<DeliveryLedgerCandidate> = candidate(D1, transaction, lag);
    delete rest.delivery_id;
    return { ...(rest as Omit<DeliveryLedgerCandidate, "delivery_id">), ride_id: ride };
  };

  it("a ride takes a GRAB row from 30 minutes before its pickup to 15 after, the chosen window", () => {
    expect(rideQualifiesAutomatically({ names_grab: true, lag_minutes: 3 })).toBe(true);
    expect(rideQualifiesAutomatically({ names_grab: true, lag_minutes: -30 })).toBe(true);
    expect(rideQualifiesAutomatically({ names_grab: true, lag_minutes: 15 })).toBe(true);
    expect(rideQualifiesAutomatically({ names_grab: true, lag_minutes: -31 })).toBe(false);
    expect(rideQualifiesAutomatically({ names_grab: true, lag_minutes: 16 })).toBe(false);
    expect(rideQualifiesAutomatically({ names_grab: false, lag_minutes: 3 })).toBe(false);
    const { rides } = proposeGrabMatches([], [], [], [paid(R1)], [rideCandidate(R1, T1, 3)], []);
    expect(rides.get(R1)).toMatchObject({ status: "matched", row: { transaction_id: T1 } });
  });

  it("a row an order and a ride both want goes to neither", () => {
    const { orders, rides } = proposeGrabMatches(
      [paid(D1)], [candidate(D1, T1, -8)], [],
      [paid(R1)], [rideCandidate(R1, T1, 3)], []
    );
    expect(orders.get(D1)!.status).toBe("ambiguous");
    expect(rides.get(R1)!.status).toBe("ambiguous");
  });

  it("an order's stored link takes its row off every ride", () => {
    const { rides } = proposeGrabMatches(
      [paid(D1)], [candidate(D1, T1, -8)], [decision(D1, T1)],
      [paid(R1)], [rideCandidate(R1, T1, 3)], []
    );
    expect(rides.get(R1)).toMatchObject({ status: "none", options: [] });
  });

  it("a ride's stored link takes its row off every order", () => {
    const { orders } = proposeGrabMatches(
      [paid(D1)], [candidate(D1, T1, -8)], [],
      [paid(R1)], [rideCandidate(R1, T1, 3)], [{ ride_id: R1, decision: "matched", transaction_id: T1, revision: 1 }]
    );
    expect(orders.get(D1)).toMatchObject({ status: "none", options: [] });
  });

  it("a ฿0 ride is outside and wants nothing", () => {
    const { orders, rides } = proposeGrabMatches(
      [paid(D1)], [candidate(D1, T1, -8)], [],
      [{ id: R1, paidOutside: true }], [rideCandidate(R1, T1, 3)], []
    );
    expect(rides.get(R1)!.status).toBe("outside");
    expect(orders.get(D1)!.status).toBe("matched");
  });
});

describe("LINE MAN orders (D-223)", () => {
  it("propose no automatic match until the window and the bank's wording are measured, but still offer rows to link", () => {
    const states = proposeGrabMatches([{ id: D1, paidOutside: false, platform: "lineman" }], [candidate(D1, T1, 2)], [], [], [], []);
    expect(states.orders.get(D1)).toMatchObject({ status: "none", options: [{ transaction_id: T1 }] });
  });
});

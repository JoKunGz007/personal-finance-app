import { describe, expect, it } from "vitest";
import {
  DELIVERY_MATCH_WINDOW_MINUTES,
  deliveryMatchRequestSchema,
  proposeDeliveryMatches,
  qualifiesAutomatically,
  type DeliveryLedgerCandidate,
  type DeliveryMatchDecision
} from "@/lib/delivery-match";

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

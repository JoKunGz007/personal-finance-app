import { describe, expect, it } from "vitest";
import { confirmMatchBody, linkBody, shopeeLinksRequestSchema, shopeeMatchRequestSchema, sumMinor, undoMatchBody } from "@/lib/shopee-view";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const T = "33333333-3333-4333-8333-333333333333";
const order = (id: string, revision: number) => ({
  id,
  match: { state: "combined_proposed" as const, transactionId: null, revision }
});

describe("shopee action bodies", () => {
  it("builds a confirm body with each order's revision", () => {
    const body = confirmMatchBody(T, [order(A, 0), order(B, 3)]);
    expect(body).toEqual({
      transactionId: T,
      orders: [{ orderId: A, expectedRevision: 0 }, { orderId: B, expectedRevision: 3 }],
      decision: "matched"
    });
    expect(shopeeMatchRequestSchema.safeParse(body).success).toBe(true);
  });
  it("builds an undo body with a null transaction", () => {
    const body = undoMatchBody([order(A, 2)]);
    expect(body.transactionId).toBeNull();
    expect(shopeeMatchRequestSchema.safeParse(body).success).toBe(true);
  });
  it("builds link and unlink bodies", () => {
    expect(shopeeLinksRequestSchema.safeParse(linkBody("refund_deposit", T, [A])).success).toBe(true);
    expect(linkBody("spaylater_repayment", T, [A, B], "unlink").action).toBe("unlink");
  });
  it("sums minor units exactly", () => {
    expect(sumMinor(["9007199254740993", "1", "-4"])).toBe("9007199254740990");
  });
});

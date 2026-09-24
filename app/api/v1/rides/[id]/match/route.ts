import { rideMatchDecisionSchema } from "@/lib/delivery-match";
import { putLedgerMatch } from "@/lib/server/ledger-match-route";

export const dynamic = "force-dynamic";

/** The owner's say over which ledger row a ride itemizes (migration 034, D-222). */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return putLedgerMatch(request, context, {
    rpc: "set_ride_match",
    idArgument: "p_ride_id",
    idField: "ride_id",
    noun: "ride",
    notOwned: "ride not owned",
    decisionSchema: rideMatchDecisionSchema,
    extraRefusals: [
      ["paid in full by discounts", "This ride was paid in full by discounts, so it has no card row to link.", 422],
      ["already claimed by a delivery", "A food order is already linked to that ledger row. Undo that link first.", 409]
    ]
  });
}

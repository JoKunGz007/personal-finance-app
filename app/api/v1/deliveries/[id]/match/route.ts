import { deliveryMatchDecisionSchema } from "@/lib/delivery-match";
import { putLedgerMatch } from "@/lib/server/ledger-match-route";

export const dynamic = "force-dynamic";

/** The owner's say over which ledger row an order itemizes (migration 033, D-220). */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return putLedgerMatch(request, context, {
    rpc: "set_delivery_match",
    idArgument: "p_delivery_id",
    idField: "delivery_id",
    noun: "order",
    notOwned: "delivery not owned",
    decisionSchema: deliveryMatchDecisionSchema,
    extraRefusals: [
      ["paid outside the platform", "This order was paid outside Grab, so it has no card row to link.", 422],
      ["already claimed by a ride", "A ride is already linked to that ledger row. Undo that link first.", 409]
    ]
  });
}

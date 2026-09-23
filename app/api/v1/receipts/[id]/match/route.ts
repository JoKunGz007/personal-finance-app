import { receiptMatchDecisionSchema } from "@/lib/receipt-match";
import { putLedgerMatch } from "@/lib/server/ledger-match-route";

export const dynamic = "force-dynamic";

/** The owner's say over which ledger row a receipt itemizes (migration 030, D-212). */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return putLedgerMatch(request, context, {
    rpc: "set_receipt_match",
    idArgument: "p_receipt_id",
    idField: "receipt_id",
    noun: "receipt",
    notOwned: "receipt not owned",
    decisionSchema: receiptMatchDecisionSchema
  });
}

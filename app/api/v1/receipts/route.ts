import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { z } from "zod";
import { proposeReceiptMatches, receiptLedgerCandidateSchema, receiptMatchDecisionSchema } from "@/lib/receipt-match";
import { captureReceipt } from "@/lib/server/receipt-store";

export const dynamic = "force-dynamic";

const money = (value: number | string | null) => (value === null ? null : String(value));

export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  // Three independent reads, started together: the receipts, the candidate rows (migration 030)
  // and the owner's stored decisions.
  const [{ data, error }, candidates, decisions] = await Promise.all([auth.supabase
    .from("receipts")
    .select("id,store_code,branch_name,receipt_number,purchased_on,purchased_at_time,payment_method,subtotal_minor,net_minor,unit_count,completeness,failed_checks,sources,items_source,items_complete,updated_at,items:receipt_items(position,quantity,name,display_name,amount_minor,is_promotion,vat_exempt),discounts:receipt_discounts(position,amount_minor)")
    .order("purchased_on", { ascending: false })
    .order("purchased_at_time", { ascending: false, nullsFirst: false }),
    auth.supabase.rpc("receipt_ledger_candidates"),
    auth.supabase.from("receipt_match_overlays").select("receipt_id,decision,transaction_id,revision")
  ]);
  if (error) return routeError("Receipts could not be loaded.", 400);

  // The match state is computed here rather than on the device. Off-contract either read is a
  // refusal, never a receipt shown as unmatched — "no row" is a claim the page would then be
  // making about the ledger without having read it.
  const parsedCandidates = z.array(receiptLedgerCandidateSchema).safeParse(candidates.data);
  const parsedDecisions = z.array(receiptMatchDecisionSchema).safeParse(decisions.data);
  if (candidates.error || decisions.error || !parsedCandidates.success || !parsedDecisions.success) {
    return routeError("Receipts could not be matched to the ledger, so none are shown.", 500);
  }
  const matches = proposeReceiptMatches((data ?? []).map((receipt) => receipt.id), parsedCandidates.data, parsedDecisions.data);

  // bigint arrives as a JS number from PostgREST, so every money column is stringified here
  // (D-018), exactly as the slips route does. Children are ordered here rather than trusted to
  // arrive in position order from the embed.
  const receipts = (data ?? []).map((receipt) => ({
    ...receipt,
    subtotal_minor: money(receipt.subtotal_minor),
    net_minor: String(receipt.net_minor),
    items: [...receipt.items].sort((a, b) => a.position - b.position).map((item) => ({ ...item, amount_minor: String(item.amount_minor) })),
    discounts: [...receipt.discounts].sort((a, b) => a.position - b.position).map((discount) => ({ ...discount, amount_minor: String(discount.amount_minor) })),
    match: matches.get(receipt.id)!
  }));
  return Response.json({ receipts }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const captured = await captureReceipt(auth.supabase, await request.json().catch(() => null));
  if (!captured.ok) {
    // "Outside the plausible window" is one the owner can act on.
    if (captured.reason === "invalid") return routeError(`The receipt is invalid: ${captured.message}`, 422, captured.details);
    // Rule 2's refusal is the one a caller can act on: two readings of one purchase disagree
    // about money, so one of them is misread. Everything else is a contract violation.
    if (captured.reason === "disagrees") {
      return routeError("This receipt's figures disagree with the copy already stored for the same purchase, so nothing was changed.", 409);
    }
    return routeError("The receipt could not be captured.", 400);
  }

  // 201 for a new receipt, 200 when it merged into one already stored — capturing the other form
  // of the same purchase is the design (migration 027), not a duplicate to apologise for.
  return Response.json(captured.data, { status: captured.data.captured ? 201 : 200, headers: noStoreHeaders });
}

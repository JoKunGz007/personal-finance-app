import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

// Lists the owner's ledger accounts so a parsed statement can be bound to one.
//
// Only the columns a chooser needs are selected. `last_four` is the widest account
// identifier the schema holds at all — no full account number exists to leak — and
// it is required here because binding is checked against the statement's printed
// last four digits and currency (lib/import-assembly.ts, DECISIONS D-017).
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase
    .from("accounts")
    .select("id,bank_code,label,account_type,last_four,currency,timezone")
    .order("label");
  if (error) return routeError("Accounts could not be loaded.", 400);
  return Response.json({ accounts: data }, { headers: noStoreHeaders });
}

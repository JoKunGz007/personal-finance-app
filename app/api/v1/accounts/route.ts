import { createAccountSchema } from "@/lib/accounts";
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

// Creates a ledger account. `public.accounts` grants `authenticated` select only, so this
// goes through `public.mutate_account` — which is also what takes the ledger-mutation
// lock, writes the audit row, and advances the mutation sequence that marks the backup
// stale. A direct insert would skip all three, and pgTAP asserts the grant stays absent.
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = createAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("Account details are invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("mutate_account", {
    p_action: "create",
    p_id: null,
    p_bank_code: parsed.data.bank_code,
    p_label: parsed.data.label,
    p_account_type: parsed.data.account_type,
    p_last_four: parsed.data.last_four
  });

  if (error) {
    // A duplicate is something the owner can act on — they already have that account —
    // so it is a conflict rather than a bad request, matching how the restore route
    // separates "not empty" from a malformed payload.
    const duplicate = /already exists/iu.test(error.message);
    return routeError(
      duplicate ? "An account at that bank already ends in those digits." : "Account could not be created.",
      duplicate ? 409 : 400
    );
  }
  return Response.json({ account: data }, { status: 201, headers: noStoreHeaders });
}

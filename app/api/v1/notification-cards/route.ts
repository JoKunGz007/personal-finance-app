import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { layoutForChannel, matchAccountDigits } from "@/lib/notification-card";
import { notificationCardCaptureSchema, notificationCardSchema } from "@/lib/notification-cards";

export const dynamic = "force-dynamic";

/**
 * The owner's captured notification cards, their corrections and their decisions (migrations 016
 * and 017, PLAN tasks 27 and 29).
 *
 * **All three on one response**, which is the posture D-067 set for slips and migration 013 set
 * for cash: the dangerous failure is the facts arriving while the owner's disagreement with them
 * does not. Cards without corrections would put a figure the owner has already replaced into the
 * ledger and its totals; cards without decisions would present an overruled pairing as the rule's
 * own, and would silently un-retire a card the owner had retired. One response cannot half-arrive.
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const { data, error } = await auth.supabase
    .from("notification_cards")
    .select(
      "id,account_id,channel,printed_account_digits,kind,amount_minor,currency,occurred_on,occurred_at_time,balance_minor,counterparty,category_id,note,captured_at"
    )
    .order("occurred_on", { ascending: false })
    .order("occurred_at_time", { ascending: false })
    .order("captured_at", { ascending: false });
  if (error) return routeError("Notification cards could not be loaded.", 400);

  const corrections = await auth.supabase
    .from("notification_card_correction_overlays")
    .select("card_id,kind,amount_minor,balance_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at");
  if (corrections.error) return routeError("Notification cards could not be loaded.", 400);

  const decisions = await auth.supabase
    .from("notification_card_decision_overlays")
    .select("card_id,decision,transaction_id,accepted_balance_mismatch,revision,updated_at");
  if (decisions.error) return routeError("Notification cards could not be loaded.", 400);

  // Every bigint arrives as a JS number from PostgREST unless it is cast, so each is stringified
  // here rather than trusted to survive JSON (D-018). The balance is money and is held to that
  // rule as firmly as the amount, rather than treated as metadata because it happens not to be
  // the transaction's own value — on the correction overlay both are nullable, and null must
  // stay null rather than becoming the string "null".
  const cards = (data ?? []).map((card) => ({
    ...card,
    amount_minor: String(card.amount_minor),
    balance_minor: String(card.balance_minor)
  }));
  return Response.json(
    {
      cards,
      corrections: (corrections.data ?? []).map((correction) => ({
        ...correction,
        amount_minor: correction.amount_minor === null ? null : String(correction.amount_minor),
        balance_minor: correction.balance_minor === null ? null : String(correction.balance_minor)
      })),
      decisions: decisions.data ?? []
    },
    { headers: noStoreHeaders }
  );
}

/**
 * Capturing a card (`public.capture_notification_card`).
 *
 * Idempotent on the fingerprint the database computes, so this is the slip's posture rather than
 * cash's: the same screenshot reaching the form twice is one card, and the RPC says which of the
 * two things happened.
 *
 * **The account binding is checked here, and here is the only place it can be.** The RPC checks
 * that the channel belongs to the account's bank, but nothing in the database checks that the
 * digits the card *printed* actually resolve to the account the owner chose — migration 016
 * stores the two side by side on purpose, so that a row records what was read as well as what it
 * was mapped to. That design makes a wrong mapping storable, and `notification_cards` is
 * append-only, so a card bound to the wrong account is not something a later correction undoes.
 * The rule is per layout and cannot be global: SCB Connect and Krungthai Connext print the
 * account's last four, which is what `accounts.last_four` holds, while KBank Live prints digits
 * 6–9 of ten with the last masked (D-099). Comparing those directly matches nothing, on every
 * card, forever — and it fails as *no such account* rather than as an error.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const parsed = notificationCardCaptureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The notification card is invalid.", 422, parsed.error.flatten());

  const layout = layoutForChannel(parsed.data.channel);
  const account = await auth.supabase
    .from("accounts")
    .select("bank_code,last_four,currency")
    .eq("id", parsed.data.accountId)
    .maybeSingle();
  // RLS scopes this to the owner, so "not found" and "not yours" are one answer and the message
  // says the safe half of it rather than confirming another owner's row exists.
  if (account.error) return routeError("The notification card could not be captured.", 400);
  if (!account.data) return routeError("That account does not exist.", 422);

  if (account.data.bank_code !== layout.bankCode) {
    return routeError(`A ${parsed.data.channel} card belongs to a ${layout.bankCode} account.`, 422);
  }

  // **Unreachable today, and kept deliberately.** `public.accounts.currency` carries
  // `check (currency = 'THB')` (migration 001), so an account in another currency cannot exist
  // and no request can reach this line — which is why there is no test for it, rather than the
  // test having been forgotten. It is here because a card is fixed to THB by the table's CHECK
  // and the RPC's default and **neither of them looks at the account**: the day `accounts` admits
  // a second currency, this is the boundary that would otherwise bind a THB card to a non-THB
  // account silently, and it would then be reconciled against rows it is not comparable to. The
  // import path refuses the same pairing (`lib/import-assembly.ts`); a card is the first
  // hand-captured record bound to an account, so it gets the same refusal in advance.
  if (account.data.currency !== "THB") {
    return routeError("That account is not held in THB, and a notification card is always THB.", 422);
  }

  const bound = matchAccountDigits(layout, parsed.data.printedAccountDigits, [account.data.last_four]);
  if (bound.outcome !== "matched") {
    return routeError(
      `The digits this ${parsed.data.channel} card printed do not belong to that account. Check the account before saving — a captured card cannot be re-bound.`,
      422
    );
  }

  const { data, error } = await auth.supabase.rpc("capture_notification_card", { p_request: parsed.data });
  if (error) {
    // The refusals a caller can act on, separated from the rest. Everything else is a contract
    // violation this route should not have been able to produce, and its message is deliberately
    // not echoed — a database message can name a stored value.
    if (error.message.includes("outside the plausible window")) {
      return routeError("The card date is outside the plausible window. Check the year is not a Buddhist-era one.", 422);
    }
    if (error.message.includes("category not owned")) return routeError("That category does not exist.", 422);
    // Both of these are already refused above. Mapped anyway rather than left to the generic
    // message, because the two checks are in different places and only the database sees the
    // state at the moment of the write.
    if (error.message.includes("account not owned")) return routeError("That account does not exist.", 422);
    if (error.message.includes("does not match the account bank")) {
      return routeError(`A ${parsed.data.channel} card belongs to a ${layout.bankCode} account.`, 422);
    }
    return routeError("The notification card could not be captured.", 400);
  }

  const result = data as { captured: boolean; card: Record<string, unknown> } | null;
  const stored = result?.card;
  // Narrowed to the published shape rather than passed through: the RPC returns the stored row
  // whole, owner id and fingerprint included, and neither belongs on the wire.
  const card = notificationCardSchema.safeParse({
    id: stored?.id,
    account_id: stored?.account_id,
    channel: stored?.channel,
    printed_account_digits: stored?.printed_account_digits,
    kind: stored?.kind,
    amount_minor: String(stored?.amount_minor),
    currency: stored?.currency,
    occurred_on: stored?.occurred_on,
    occurred_at_time: stored?.occurred_at_time,
    balance_minor: String(stored?.balance_minor),
    counterparty: stored?.counterparty ?? null,
    category_id: stored?.category_id ?? null,
    note: stored?.note ?? null,
    captured_at: stored?.captured_at
  });
  if (!card.success) {
    // The card *was* written — saying otherwise would invite the owner to re-enter a payment
    // record that has already landed, and this table is append-only.
    return routeError("The card was saved but could not be read back in its published shape. Reload the ledger.", 500);
  }

  // 201 when a row was written, 200 when this exact card was already held.
  return Response.json(
    { captured: result?.captured === true, card: card.data },
    { status: result?.captured === true ? 201 : 200, headers: noStoreHeaders }
  );
}

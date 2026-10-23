import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import type { DateRange } from "@/lib/date-range";
import {
  cursorAfter,
  ledgerPageSchema,
  ledgerPageSearch,
  matchCandidateListSchema,
  autoExcludedListSchema,
  duplicateListSchema,
  type AccountTransaction
} from "@/lib/transactions";
import { categoryListSchema, type Category } from "@/lib/categories";
import { receiptListSchema, receiptsOnRows, type StoredReceipt } from "@/lib/receipts";
import { getShopeeView } from "@/lib/browser/shopee-client";
import { shopeeOrdersOnRows, type ShopeeViewOrder } from "@/lib/shopee-view";
import { deliveriesOnRows, deliveryListSchema, ridesOnRows, type StoredDelivery, type StoredRide } from "@/lib/deliveries";
import { emptyWindow, withPage, type LedgerWindow } from "@/lib/ledger-window";
import {
  notificationCardListSchema,
  type NotificationCard,
  type NotificationCardCorrection,
  type NotificationCardDecision
} from "@/lib/notification-cards";
import { slipListSchema, type CapturedSlip, type SlipCorrection, type SlipMatchDecision } from "@/lib/slips";
import { cashListSchema, type CashCorrection, type CashEntry } from "@/lib/cash";
import { ledgerRequest } from "@/lib/wire";

/**
 * Everything the ledger view reads, in one value (D-293).
 *
 * A fail-soft part carries its own error beside its data, so the caller can show "slips could not
 * be loaded" next to a ledger that did load. `categories` is `null` on a failure so the caller
 * keeps the last good list; the sets and maps are empty on a failure, which is how the view
 * already read a missing answer ("Excluded" stays plainly true, a missing receipt claims nothing).
 */
export type LedgerSnapshot = {
  readonly range: DateRange;
  readonly accounts: LedgerAccount[];
  readonly window: LedgerWindow;
  readonly candidates: AccountTransaction[];
  readonly slips:
    | { readonly ok: true; readonly slips: CapturedSlip[]; readonly matches: SlipMatchDecision[]; readonly corrections: SlipCorrection[] }
    | { readonly ok: false; readonly why: string };
  readonly cash:
    | { readonly ok: true; readonly entries: CashEntry[]; readonly corrections: CashCorrection[] }
    | { readonly ok: false; readonly why: string };
  readonly cards:
    | {
        readonly ok: true;
        readonly cards: NotificationCard[];
        readonly corrections: NotificationCardCorrection[];
        readonly decisions: NotificationCardDecision[];
      }
    | { readonly ok: false; readonly why: string };
  readonly categories: Category[] | null;
  readonly autoExcluded: ReadonlySet<string>;
  readonly duplicates: ReadonlySet<string>;
  readonly receiptByRow: Map<string, StoredReceipt>;
  readonly deliveryByRow: Map<string, StoredDelivery>;
  readonly rideByRow: Map<string, StoredRide>;
  readonly shopeeByRow: Map<string, ShopeeViewOrder[]>;
};

export type LedgerSnapshotResult =
  | { readonly kind: "loaded"; readonly snapshot: LedgerSnapshot }
  /** The first request was answered 401 or 403; the caller decides whether that is worth an alert. */
  | { readonly kind: "refused"; readonly status: 401 | 403; readonly why: string }
  | { readonly kind: "failed"; readonly why: string };

const UNREACHABLE = "The ledger could not be reached. Check that the local Supabase stack is running.";

/**
 * Fetches and reads everything the ledger view shows. Read-only: the auto-categorise POST is not
 * here (it writes), and nothing here touches component state, so a caller commits the result in
 * one block or not at all.
 *
 * Never rejects: a thrown error anywhere becomes `failed` with the "could not be reached" wording.
 */
export async function loadLedgerSnapshot(range: DateRange): Promise<LedgerSnapshotResult> {
  try {
    return await readLedgerSnapshot(range);
  } catch {
    return { kind: "failed", why: UNREACHABLE };
  }
}

async function readLedgerSnapshot(range: DateRange): Promise<LedgerSnapshotResult> {
  // **The two blocking loads used to be the two least defended.** Both parsed their body with
  // a bare `.json()` while the three optional loads below guarded theirs, so a platform error
  // page — HTML, not JSON — threw here and was caught at the bottom as "the ledger could not be
  // reached", sending the owner to check Docker when the route had in fact answered him.
  // `ledgerRequest` tells the three cases apart; `unreachable` keeps the wording that was right
  // for the case it really was.
  const accountsResult = await ledgerRequest("/api/v1/accounts", accountListSchema, {
    fallback: "Accounts could not be loaded.",
    unreachable: UNREACHABLE,
    offContract: "The accounts response did not match its contract. Run the unit tests before trusting this view."
  });
  if (!accountsResult.ok) {
    // **Signed out is not a failure, and the view is where that distinction becomes visible.**
    // The ledger loads on arrival, so a visitor who is not signed in issues a request before
    // touching anything, and `strongOwnerClient` correctly answers 401 — 403 for a signed-in
    // identity that is not the owner, or is the owner without aal2. Reporting any of those as
    // "Not loaded" would put a red alert on the first surface anyone sees, describing a route
    // working exactly as designed, so the status travels with the refusal and the caller decides.
    if (accountsResult.status === 401 || accountsResult.status === 403) {
      return { kind: "refused", status: accountsResult.status, why: accountsResult.why };
    }
    return { kind: "failed", why: accountsResult.why };
  }

  // **Every request below is issued now, in one wave, and only the reading stays in order.**
  // Accounts is the one real dependency — the page requests need its list — and it goes first
  // for a second reason too: a signed-out arrival stops above with one 401 rather than six.
  // Past it, nothing any request sends depends on another's answer, so they used to wait on
  // each other for no reason: nine round trips in series with three accounts.
  //
  // **What did not change is the order results are read in**, and that order is load-bearing: a
  // failed page or candidate set still returns before slips, cash or cards are read, and each
  // fail-hard or fail-soft branch still reads exactly as it did.
  // `ledgerRequest` resolves rather than rejects on every failure, so a request left unawaited by
  // an early return cannot surface as an unhandled rejection.
  const pageRequests = accountsResult.data.accounts.map((account) => ({
    account,
    // The window's own bounds, cursor null for a first page — `ledgerPageSearch` is what
    // `loadMore` reuses so a deeper page cannot forget them.
    result: ledgerRequest(
      `/api/v1/accounts/${account.id}/transactions${ledgerPageSearch(range, null)}`, ledgerPageSchema, {
        fallback: `Transactions could not be loaded for ${account.label}.`,
        unreachable: UNREACHABLE,
        offContract: `The transactions response for ${account.label} did not match its contract.`
      })
  }));
  const candidateRequest = ledgerRequest(
    "/api/v1/transactions/match-candidates", matchCandidateListSchema, {
      fallback: "The reconciliation set could not be loaded, so the ledger is not shown.",
      unreachable: UNREACHABLE,
      offContract: "The reconciliation set did not match its contract, so the ledger is not shown."
    });
  const slipsRequest = ledgerRequest("/api/v1/slips", slipListSchema, {
    fallback: "Captured slips could not be loaded, so none are shown.",
    offContract: "The slips response did not match its contract, so none are shown."
  });
  const cashRequest = ledgerRequest("/api/v1/cash", cashListSchema, {
    fallback: "Cash entries could not be loaded, so none are shown.",
    offContract: "The cash response did not match its contract, so none are shown."
  });
  const cardsRequest = ledgerRequest("/api/v1/notification-cards", notificationCardListSchema, {
    fallback: "Captured notification cards could not be loaded, so none are shown.",
    offContract: "The notification cards response did not match its contract, so none are shown."
  });
  const autoExcludedRequest = ledgerRequest("/api/v1/transactions/auto-excluded", autoExcludedListSchema, {
    fallback: "Automatically excluded rows could not be loaded.",
    offContract: "The automatically excluded rows did not match their contract."
  });
  const duplicatesRequest = ledgerRequest("/api/v1/transactions/duplicates", duplicateListSchema, {
    fallback: "Duplicate rows could not be loaded.",
    offContract: "The duplicate rows did not match their contract."
  });
  const receiptsRequest = ledgerRequest("/api/v1/receipts", receiptListSchema, {
    fallback: "Receipts could not be loaded.",
    offContract: "The receipts response did not match its contract."
  });
  const deliveriesRequest = ledgerRequest("/api/v1/deliveries", deliveryListSchema, {
    fallback: "Delivery orders could not be loaded.",
    offContract: "The orders response did not match its contract."
  });
  const shopeeRequest = getShopeeView();
  const categoriesRequest = ledgerRequest("/api/v1/categories", categoryListSchema, {
    fallback: "Categories could not be loaded.",
    offContract: "The categories response did not match its contract, so none are shown."
  });

  // One call per account, and **one page** per call. The RPC is per-account and there is no
  // all-accounts one; taking each account's newest page and merging is still exactly right for the
  // merged view, because any row among the newest N of the union is necessarily among the newest N
  // of its own account. Read in account order, so the first failing account is still the one
  // reported.
  let window = emptyWindow();
  for (const { account, result: pending } of pageRequests) {
    const result = await pending;
    if (!result.ok) return { kind: "failed", why: result.why };
    window = withPage(window, account.id, result.data, cursorAfter(result.data.rows));
  }

  // **The candidate set, and it is not optional the way slips and cash are.** Those fail soft
  // because the confirmed ledger is the authority and an outage in a captured record must not
  // hide it. This is different: without it the matching rule runs over a page and can pair a slip
  // that is genuinely ambiguous, which shows `verified` on a row nobody ever confirmed. A missing
  // answer is recoverable; a confidently wrong one about money is not, so a failure here stops
  // the load with the rest of the ledger (D-158).
  const candidateResult = await candidateRequest;
  if (!candidateResult.ok) return { kind: "failed", why: candidateResult.why };

  // Provisional entries, read after the confirmed ones and deliberately unable to fail the view.
  // The ledger is the authority; a slips outage must not hide it, so a failure here is reported
  // beside the rows instead of replacing them. Decisions travel with the slips (one response, for
  // exactly that reason, D-067): keeping stale ones while the slips they belong to failed to load
  // would reconcile against records no longer on screen, and keeping none while the slips loaded
  // would present an overruled pairing as the rule's own.
  const slipsResult = await slipsRequest;
  const slips: LedgerSnapshot["slips"] = slipsResult.ok
    ? { ok: true, slips: slipsResult.data.slips, matches: slipsResult.data.matches, corrections: slipsResult.data.corrections }
    : { ok: false, why: slipsResult.why };

  // Cash entries, on the same terms: the confirmed ledger is the authority, so a failure here is
  // reported beside the rows rather than replacing them. Corrections arrive on the same response
  // as the entries they correct — showing an entry whose correction went missing would put a
  // figure the owner has already replaced into the ledger and into its totals.
  const cashResult = await cashRequest;
  const cash: LedgerSnapshot["cash"] = cashResult.ok
    ? { ok: true, entries: cashResult.data.entries, corrections: cashResult.data.corrections }
    : { ok: false, why: cashResult.why };

  // Notification cards, last and on the same terms. A card that fails to load is a payment missing
  // from the view, which is why the caller says it out loud rather than leaving it to a shorter
  // row count nobody would notice. Corrections and decisions travel with the cards they belong
  // to, for the reason slips and cash do it.
  const cardsResult = await cardsRequest;
  const cards: LedgerSnapshot["cards"] = cardsResult.ok
    ? { ok: true, cards: cardsResult.data.cards, corrections: cardsResult.data.corrections, decisions: cardsResult.data.decisions }
    : { ok: false, why: cardsResult.why };

  // Categories, on the same fail-soft terms: a row's chip and the editor's picker both read this,
  // but neither is the confirmed ledger itself, so an outage here must not hide it. `null` on a
  // failure means "keep the list already held" — usually empty, on the first load — rather than
  // surfacing a banner for a list nothing above the table depends on.
  const categoriesResult = await categoriesRequest;
  const categories = categoriesResult.ok ? categoriesResult.data.categories : null;
  // Only a label: a failure leaves the rows plainly "Excluded", which is still true.
  const autoExcludedResult = await autoExcludedRequest;
  const autoExcluded = new Set(autoExcludedResult.ok ? autoExcludedResult.data.ids : []);
  // Same rule: a failure leaves the rows shown as plainly "Excluded", which is still true, and
  // nothing is hidden on an answer that did not arrive.
  const duplicatesResult = await duplicatesRequest;
  const duplicates = new Set(duplicatesResult.ok ? duplicatesResult.data.ids : []);
  // Only an addition to a row: a failure shows no receipt, which claims nothing about the row.
  const receiptsResult = await receiptsRequest;
  const receiptByRow = new Map(receiptsResult.ok ? receiptsOnRows(receiptsResult.data.receipts) : []);
  const deliveriesResult = await deliveriesRequest;
  const deliveryByRow = new Map(deliveriesResult.ok ? deliveriesOnRows(deliveriesResult.data.deliveries) : []);
  const rideByRow = new Map(deliveriesResult.ok ? ridesOnRows(deliveriesResult.data.rides) : []);
  const shopeeResult = await shopeeRequest;
  const shopeeByRow = shopeeResult.ok ? shopeeOrdersOnRows(shopeeResult.data.orders) : new Map<string, ShopeeViewOrder[]>();

  return {
    kind: "loaded",
    snapshot: {
      range,
      accounts: accountsResult.data.accounts,
      window,
      candidates: candidateResult.data.candidates,
      slips,
      cash,
      cards,
      categories,
      autoExcluded,
      duplicates,
      receiptByRow,
      deliveryByRow,
      rideByRow,
      shopeeByRow
    }
  };
}

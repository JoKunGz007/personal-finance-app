import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, toMinorAmount } from "@/lib/money";
import { NOTIFICATION_CARD_LAYOUTS } from "@/lib/notification-card";
import { PREFILL_FIELDS } from "@/lib/notification-card-prefill";
import {
  applyCorrection,
  correctionFields,
  correctionRequestFields,
  refineCorrection,
  refineCorrectionRequest
} from "@/lib/corrections";

// The wire contract for capturing a bank's LINE push notification (PLAN task 27,
// migration 016).
//
// **What this schema can check and what it structurally cannot.** A card carries no reference
// and no QR, so unlike `lib/slips.ts` there is no payload to re-derive an identity from — D-098
// answers that with a fingerprint the database computes from the stored facts, which no caller
// can supply, influence or replay. What is left for this file is the shape of what the owner
// typed, plus the one refusal that is purely arithmetic: the amount's sign has to agree with the
// direction.
//
// Two further checks need the database and therefore live in the route, not here:
//
//   * the channel must belong to the chosen account's bank, which `capture_notification_card`
//     also enforces; and
//   * the digits the card printed must actually resolve to the chosen account under **that
//     layout's** mask — `matchAccountDigits` in `lib/notification-card.ts`. **The RPC does not
//     check this and cannot**: it stores `account_id` and `printed_account_digits` side by side
//     precisely so a row records what was read as well as what it was mapped to, which means a
//     wrong mapping is storable. The route is the only place that refuses it, and the table is
//     append-only, so it is the last place that can.

export const NOTIFICATION_CARD_KINDS = ["deposit", "withdrawal"] as const;

export const NOTIFICATION_CARD_CHANNELS = NOTIFICATION_CARD_LAYOUTS.map((layout) => layout.channel) as unknown as [
  "SCB Connect",
  "KBank Live",
  "Krungthai Connext"
];

/**
 * The window a card's date must fall in.
 *
 * `capture_notification_card` enforces the same bound server-side (migration 016) and it exists
 * for D-031's reason: two of the three layouts print a two-digit Buddhist year, and one resolved
 * with the wrong era rule lands 543 years out while parsing cleanly the whole way. This copy is
 * so the form can say so before submitting rather than after.
 *
 * A card is days old rather than months, but the window matches the slip and cash ones instead
 * of being tightened to match — a card found in the camera roll weeks later is ordinary, and a
 * bound that admits exactly one era is all this has to do.
 */
export const NOTIFICATION_CARD_MAX_AGE_YEARS = 10;

export function notificationCardDateWindow(today: Date): { earliest: string; latest: string } {
  const latest = new Date(today);
  latest.setUTCDate(latest.getUTCDate() + 1);
  const earliest = new Date(today);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - NOTIFICATION_CARD_MAX_AGE_YEARS);
  return { earliest: earliest.toISOString().slice(0, 10), latest: latest.toISOString().slice(0, 10) };
}

/**
 * The write contract for POST /api/v1/notification-cards.
 *
 * **`occurredAtTime` is required, unlike a slip's**, and that is the table's shape rather than a
 * stricter client: all three layouts print `hh:mm`, and the time is load-bearing — it equalled
 * the statement row's on all six measured cards, so account plus date plus time already locates
 * the row and the balance then confirms it (D-098). A card without a time would be a card that
 * cannot reconcile.
 *
 * **`balanceMinor` is money and is held to the same rule as the amount**, canonical int64 text
 * rather than a JSON number (D-002), because it is stored, exported and part of the fingerprint.
 * It carries no sign check: a balance is a position rather than a movement, zero is ordinary —
 * two measured cards carry one — and a negative one is an overdraft rather than a mistake.
 *
 * No `currency`: the RPC defaults it and the table's CHECK enforces THB, so a currency on the
 * wire would be a value the server ignores, which reads as a choice the owner does not have.
 * Same argument `lib/cash.ts` makes.
 *
 * **`prefillOffered` and `prefillChanged` are field names and can never be anything else**
 * (migration 019, D-114, D-116). They record which of a card's four digit-bearing fields the OCR
 * pre-fill offered a value for, and which of those the owner changed before submitting — the
 * denominator the trial needs, and **structure rather than values**, so no amount, balance, date
 * or digit may travel in either. `z.enum` over the same constant the pre-fill module fills from is
 * what makes that true by construction: a free-text array would accept a figure and look identical
 * at this call site.
 *
 * **Both are optional, and absent means an empty list rather than a refusal.** A card the engine
 * could not read at all offers nothing, and a browser with no pre-fill — which is every browser
 * until this ships — must keep capturing exactly as it does today. The database holds the same
 * rule for the same reason (D-109's ordering: every push to `main` deploys).
 */
export const notificationCardCaptureSchema = z.object({
  accountId: z.string().uuid(),
  channel: z.enum(NOTIFICATION_CARD_CHANNELS),
  printedAccountDigits: z.string().regex(/^[0-9]{4}$/),
  kind: z.enum(NOTIFICATION_CARD_KINDS),
  amountMinor: minorUnitStringSchema,
  balanceMinor: minorUnitStringSchema,
  occurredOn: isoDateSchema,
  occurredAtTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  counterparty: z.string().trim().min(1).max(240).nullable(),
  categoryId: z.string().uuid().nullable(),
  note: z.string().trim().min(1).max(2000).nullable(),
  prefillOffered: z.array(z.enum(PREFILL_FIELDS)).optional(),
  prefillChanged: z.array(z.enum(PREFILL_FIELDS)).optional()
}).strict().superRefine((card, context) => {
  const amount = toMinorAmount(card.amountMinor);
  if (amount !== null && ((card.kind === "deposit" && amount <= 0n) || (card.kind === "withdrawal" && amount >= 0n))) {
    context.addIssue({
      code: "custom",
      message: "The amount's sign does not match the card's direction.",
      path: ["amountMinor"]
    });
  }
  // A field named twice would double-count it in any rate built from these rows, and the two
  // lists would stop being comparable. Refused here as well as in the database, because this is
  // the layer that can say which field is at fault.
  for (const [key, names] of [["prefillOffered", card.prefillOffered], ["prefillChanged", card.prefillChanged]] as const) {
    if (names && new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", message: "A field may be named only once.", path: [key] });
    }
  }
  // **A field changed that was never offered is not a correction.** It is a caller with a broken
  // model of its own form, and letting it through would inflate every rate computed from these
  // rows — the one number the trial is for.
  const offered = new Set(card.prefillOffered ?? []);
  for (const name of card.prefillChanged ?? []) {
    if (!offered.has(name)) {
      context.addIssue({
        code: "custom",
        message: "A field cannot be changed from a pre-filled value it was never offered.",
        path: ["prefillChanged"]
      });
    }
  }
});

export type NotificationCardCapture = z.infer<typeof notificationCardCaptureSchema>;

/**
 * The read contract for GET /api/v1/notification-cards.
 *
 * Column names stay as the database returns them, matching every other read endpoint, and both
 * money values arrive as canonical text because the route stringifies the bigints (D-018).
 *
 * **`fingerprint`, `fingerprint_version` and `owner_id` are deliberately absent.** The row's `id`
 * is the handle a client needs; the fingerprint is internal identity computed by the database
 * from the stored facts, and publishing it would put the dedup key on the wire for no caller
 * that has a use for it. What the client does need to know — whether a capture was a new row or
 * one already held — arrives on the capture response as `captured`.
 *
 * Strict for the reason every read schema here is: a migration that adds a column should fail
 * this parse loudly rather than have the ledger quietly ignore a field the database now
 * considers part of a card.
 */
export const notificationCardSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  channel: z.enum(NOTIFICATION_CARD_CHANNELS),
  printed_account_digits: z.string().regex(/^[0-9]{4}$/),
  kind: z.enum(NOTIFICATION_CARD_KINDS),
  amount_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  occurred_on: isoDateSchema,
  occurred_at_time: z.string(),
  balance_minor: minorUnitStringSchema,
  counterparty: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  note: z.string().nullable(),
  captured_at: z.string()
}).strict();

export type NotificationCard = z.infer<typeof notificationCardSchema>;

/**
 * A card's correction overlay (migration 017, PLAN task 29).
 *
 * The shared seven columns plus `balance_minor`, which is the one field no other correctable
 * record has — a slip and a cash entry print no balance, so there was never a second figure to
 * correct. Null in any column means **not corrected**, and the base row's value stands.
 */
export const notificationCardCorrectionSchema = z.object({
  card_id: z.string().uuid(),
  balance_minor: minorUnitStringSchema.nullable(),
  ...correctionFields
}).strict().superRefine(refineCorrection);

export type NotificationCardCorrection = z.infer<typeof notificationCardCorrectionSchema>;

/**
 * A card's stored decision (migration 017).
 *
 * Three values where a slip's match overlay has two. `not-a-payment` retires the card: it leaves
 * the ledger rows and the totals while staying in its append-only table, because nothing here is
 * ever deleted. That is the remedy for a card captured against the wrong account or captured
 * twice — the binding itself cannot be re-made after capture (D-101, D-103).
 *
 * `accepted_balance_mismatch` is the owner's acknowledgement, recorded at the moment the decision
 * was made, that the card's balance and the row's disagree. **Not a live comparison**: re-deriving
 * it at read time would change its answer the moment the balance is corrected, and this is a fact
 * about a decision rather than about the two figures as they now stand.
 */
export const NOTIFICATION_CARD_DECISIONS = ["matched", "unmatched", "not-a-payment"] as const;

export const notificationCardDecisionSchema = z.object({
  card_id: z.string().uuid(),
  decision: z.enum(NOTIFICATION_CARD_DECISIONS),
  transaction_id: z.string().uuid().nullable(),
  accepted_balance_mismatch: z.boolean(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string()
}).strict().superRefine((decision, context) => {
  if ((decision.decision === "matched") !== (decision.transaction_id !== null)) {
    context.addIssue({
      code: "custom",
      message: "A matched decision names a statement row, and the other two do not.",
      path: ["transaction_id"]
    });
  }
  if (decision.accepted_balance_mismatch && decision.decision !== "matched") {
    context.addIssue({
      code: "custom",
      message: "Only a matched decision can have accepted a balance mismatch.",
      path: ["accepted_balance_mismatch"]
    });
  }
});

export type NotificationCardDecision = z.infer<typeof notificationCardDecisionSchema>;

/**
 * Cards, their corrections and their decisions travel on **one** response.
 *
 * The same argument D-067 makes for slips and migration 013 makes for cash: the dangerous
 * half-arrival is the facts arriving while the owner's disagreement with them does not. Cards
 * without corrections would put a figure the owner has already replaced into the ledger and its
 * totals; cards without decisions would present an overruled pairing as the rule's own, and would
 * silently un-retire a card the owner had retired.
 */
export const notificationCardListSchema = z.object({
  cards: z.array(notificationCardSchema),
  corrections: z.array(notificationCardCorrectionSchema),
  decisions: z.array(notificationCardDecisionSchema)
}).strict();

/**
 * The write contract for a card's correction, mirroring `set_notification_card_correction`.
 *
 * Built from the shared shape rather than restated, plus `balanceMinor`. The balance carries **no
 * sign rule**, for the reason the capture contract above gives: a balance is a position rather
 * than a movement, so zero is ordinary and a negative one is an overdraft.
 *
 * Sending every field null is a legitimate request — it clears the correction and lets the
 * originals stand again, which is what makes a mistaken correction itself correctable.
 */
export const notificationCardCorrectionRequestSchema = z.object({
  ...correctionRequestFields,
  balanceMinor: minorUnitStringSchema.nullable()
}).strict().superRefine(refineCorrectionRequest);

export type NotificationCardCorrectionRequest = z.infer<typeof notificationCardCorrectionRequestSchema>;

/**
 * The write contract for a card's decision, mirroring `set_notification_card_decision`.
 *
 * `acceptBalanceMismatch` is the explicit acknowledgement the RPC demands before it will store a
 * pairing whose balances disagree (D-103). It defaults to false, so the fail-closed posture is
 * what a caller gets by omission rather than by remembering — a client that forgets the field
 * gets the refusal, never the override.
 */
export const notificationCardDecisionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(NOTIFICATION_CARD_DECISIONS),
  transactionId: z.string().uuid().nullable(),
  acceptBalanceMismatch: z.boolean().default(false)
}).strict().superRefine((request, context) => {
  if ((request.decision === "matched") !== (request.transactionId !== null)) {
    context.addIssue({
      code: "custom",
      message: "A matched decision names a statement row, and the other two do not.",
      path: ["transactionId"]
    });
  }
});

export type NotificationCardDecisionRequest = z.infer<typeof notificationCardDecisionRequestSchema>;

export const notificationCardCorrectionResponseSchema = z.object({
  correction: notificationCardCorrectionSchema
}).strict();

export const notificationCardDecisionResponseSchema = z.object({
  decision: notificationCardDecisionSchema
}).strict();

/**
 * Each card as it stands after its correction — the card half of `slipsInForce`.
 *
 * Two figures resolved rather than one, and the balance is the reason this could not simply reuse
 * `applyCorrection`: the reconciliation matches on the balance as well as the amount, so a view
 * that corrected one and not the other would pair on a figure the owner has replaced. Migration
 * 014 is the record of that defect being paid for once already, on a record with only one figure.
 */
export function cardsInForce(
  cards: readonly NotificationCard[],
  corrections: readonly NotificationCardCorrection[] = []
): NotificationCard[] {
  const byCard = new Map(corrections.map((correction) => [correction.card_id, correction]));
  return cards.map((card) => {
    const correction = byCard.get(card.id);
    if (!correction) return card;
    const corrected = applyCorrection(card, correction);
    return correction.balance_minor === null
      ? corrected
      : { ...corrected, balance_minor: correction.balance_minor };
  });
}

/**
 * The capture response, and the `captured` flag is the whole reason it has a shape of its own.
 *
 * `false` means this exact card was already held. Re-capturing is the expected accident here for
 * the reason it is with share-to-app — the same screenshot reaches the form twice — so the
 * second one is a success the client reports plainly rather than an error it has to interpret.
 * A *different* amount is a different fingerprint and therefore a second row, which is why this
 * flag can only be false on an exact re-capture (migration 016).
 */
export const notificationCardCaptureResponseSchema = z.object({
  captured: z.boolean(),
  card: notificationCardSchema
}).strict();

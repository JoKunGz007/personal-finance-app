import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, toMinorAmount } from "@/lib/money";
import { NOTIFICATION_CARD_LAYOUTS } from "@/lib/notification-card";

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
  note: z.string().trim().min(1).max(2000).nullable()
}).strict().superRefine((card, context) => {
  const amount = toMinorAmount(card.amountMinor);
  if (amount !== null && ((card.kind === "deposit" && amount <= 0n) || (card.kind === "withdrawal" && amount >= 0n))) {
    context.addIssue({
      code: "custom",
      message: "The amount's sign does not match the card's direction.",
      path: ["amountMinor"]
    });
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

export const notificationCardListSchema = z.object({ cards: z.array(notificationCardSchema) }).strict();

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

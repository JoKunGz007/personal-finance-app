import { describe, expect, it } from "vitest";
import {
  BACKUP_TABLE_KINDS,
  BACKUP_TABLE_KINDS_V10,
  BACKUP_TABLE_KINDS_V12,
  BACKUP_TABLE_KINDS_V13,
  backupDataSchema,
  backupDataSchemaV10,
  backupDataSchemaV12,
  backupDataSchemaV13,
  backupSnapshotSchemaV16
} from "@/lib/backup-contract";

// One failing input per rule the contract restates from a SQL CHECK or a cross-field invariant.
// Every input is a valid synthetic row with exactly one field changed, so a failure can only be
// the rule under test, and each assertion pins the rule's message rather than "it failed".

type RowSchema = { safeParse: (value: unknown) => { success: boolean; error?: { issues: Array<{ message: string }> } } };

function rowSchemaOf(dataSchema: unknown, table: string): RowSchema {
  const shape = (dataSchema as { shape: Record<string, { element: RowSchema }> }).shape;
  return shape[table]!.element;
}

function messagesOf(schema: RowSchema, row: unknown): string[] {
  const result = schema.safeParse(row);
  return result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);
}

const ownerId = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const at = "2026-09-02T03:00:00.000Z";

const NEGATIVE = "Money must not be negative.";
const POSITIVE = "Money must be positive.";

describe("A4: money columns restate their non-negative SQL CHECKs", () => {
  const orderId = id(1);
  const deliveryId = id(2);
  const rideId = id(3);
  const valid = {
    deliveries: { id: deliveryId, owner_id: ownerId, platform: "grabfood", booking_id: "A-SYNTHETIC1", restaurant: "Invented Cafe",
      payment_method: null, receipt_sent_at: at, food_minor: "25000", delivery_fee_minor: "1500", total_minor: "26500", created_at: at, service: "food" },
    delivery_items: { id: id(4), owner_id: ownerId, delivery_id: deliveryId, position: 1, quantity: 1, name: "Invented dish", options: [], amount_minor: "25000" },
    delivery_adjustments: { id: id(5), owner_id: ownerId, delivery_id: deliveryId, position: 1, kind: "discount", name: "Invented promo", amount_minor: "500" },
    lineman_order_details: { delivery_id: deliveryId, owner_id: ownerId, ordered_at: at, charged_minor: "26500" },
    rides: { id: rideId, owner_id: ownerId, booking_id: "A-SYNTHRIDE1", ride_type: "Car", picked_up_at: at, dropped_off_at: at,
      pickup_place: "Invented A", dropoff_place: "Invented B", distance_meters: 1000, duration_minutes: 10, payment_method: "Cash",
      fare_minor: "9000", platform_fee_minor: "500", total_minor: "9500", created_at: at },
    ride_adjustments: { id: id(6), owner_id: ownerId, ride_id: rideId, position: 1, kind: "discount", name: "Invented promo", amount_minor: "500" },
    shopee_orders: { id: orderId, owner_id: ownerId, order_code: "BKPORDER0001", link_id: "9000000000000001", placed_at: at, paid_at: null,
      shop: "Invented Shop", payment_method: "ShopeePay", payment_kind: "wallet", total_minor: "30000", item_price_is: "line total",
      facts_digest: "a".repeat(64), created_at: at },
    shopee_order_items: { id: id(7), owner_id: ownerId, order_id: orderId, position: 1, name: "Invented widget", variation: null,
      quantity: 2, price_minor: "1000", original_price_minor: "1200" },
    shopee_refunds: { id: id(8), owner_id: ownerId, order_id: orderId, request_id: "BKPREFUND01", requested_at: at, refund_minor: "15000",
      refund_to: "bank", requested_by: "buyer", reason: null, steps: ["Refunded"], created_at: at }
  } as const;

  // table, column, and the message the column's SQL CHECK maps to.
  const columns: Array<[keyof typeof valid, string, string]> = [
    ["deliveries", "food_minor", NEGATIVE],
    ["deliveries", "delivery_fee_minor", NEGATIVE],
    ["deliveries", "total_minor", NEGATIVE],
    ["delivery_items", "amount_minor", NEGATIVE],
    ["delivery_adjustments", "amount_minor", POSITIVE],
    ["lineman_order_details", "charged_minor", NEGATIVE],
    ["rides", "fare_minor", NEGATIVE],
    ["rides", "platform_fee_minor", NEGATIVE],
    ["rides", "total_minor", NEGATIVE],
    ["ride_adjustments", "amount_minor", POSITIVE],
    ["shopee_orders", "total_minor", NEGATIVE],
    ["shopee_order_items", "price_minor", NEGATIVE],
    ["shopee_order_items", "original_price_minor", NEGATIVE],
    ["shopee_refunds", "refund_minor", POSITIVE]
  ];

  it("accepts every valid synthetic row, so each failure below is the one changed field", () => {
    for (const [table, row] of Object.entries(valid)) {
      expect(messagesOf(rowSchemaOf(backupDataSchema, table), row), table).toEqual([]);
    }
  });

  it.each(columns)("refuses a negative %s.%s", (table, column, message) => {
    const row = { ...valid[table], [column]: "-1" };
    expect(messagesOf(rowSchemaOf(backupDataSchema, table), row)).toEqual([message]);
  });

  it("refuses a negative on a delivery row, a ride row and a Shopee row (the A4 defect)", () => {
    expect(messagesOf(rowSchemaOf(backupDataSchema, "deliveries"), { ...valid.deliveries, total_minor: "-100" })).toContain(NEGATIVE);
    expect(messagesOf(rowSchemaOf(backupDataSchema, "rides"), { ...valid.rides, total_minor: "-100" })).toContain(NEGATIVE);
    expect(messagesOf(rowSchemaOf(backupDataSchema, "shopee_orders"), { ...valid.shopee_orders, total_minor: "-100" })).toContain(NEGATIVE);
  });

  it("refuses zero where SQL says > 0, and accepts zero where SQL says >= 0", () => {
    for (const [table, column] of [["delivery_adjustments", "amount_minor"], ["ride_adjustments", "amount_minor"], ["shopee_refunds", "refund_minor"]] as const) {
      expect(messagesOf(rowSchemaOf(backupDataSchema, table), { ...valid[table], [column]: "0" }), `${table}.${column}`).toEqual([POSITIVE]);
    }
    for (const [table, column] of [["deliveries", "food_minor"], ["rides", "fare_minor"], ["shopee_orders", "total_minor"], ["shopee_order_items", "price_minor"]] as const) {
      expect(messagesOf(rowSchemaOf(backupDataSchema, table), { ...valid[table], [column]: "0" }), `${table}.${column}`).toEqual([]);
    }
  });

  it("keeps a nullable column nullable, and a Shopee price line signed", () => {
    expect(messagesOf(rowSchemaOf(backupDataSchema, "deliveries"), { ...valid.deliveries, delivery_fee_minor: null })).toEqual([]);
    expect(messagesOf(rowSchemaOf(backupDataSchema, "shopee_order_items"), { ...valid.shopee_order_items, price_minor: null, original_price_minor: null })).toEqual([]);
    const priceLine = { id: id(9), owner_id: ownerId, order_id: orderId, position: 1, label: "Voucher", amount_minor: "-2000" };
    expect(messagesOf(rowSchemaOf(backupDataSchema, "shopee_order_price_lines"), priceLine)).toEqual([]);
  });

  it("does not throw on a non-canonical value, and still reports the canonical-form rule", () => {
    const schema = rowSchemaOf(backupDataSchema, "rides");
    expect(messagesOf(schema, { ...valid.rides, fare_minor: "1.5" })).toEqual(["Money must be a canonical signed integer string."]);
    expect(messagesOf(schema, { ...valid.rides, fare_minor: 100 }).length).toBeGreaterThan(0);
  });

  it("applies to the older versions that carry the tables, through the shared row schema", () => {
    const old: Array<[string, unknown, readonly string[]]> = [
      ["v10", backupDataSchemaV10, BACKUP_TABLE_KINDS_V10],
      ["v12", backupDataSchemaV12, BACKUP_TABLE_KINDS_V12],
      ["v13", backupDataSchemaV13, BACKUP_TABLE_KINDS_V13]
    ];
    for (const [name, data, kinds] of old) {
      for (const [table, column] of [["deliveries", "total_minor"], ["delivery_items", "amount_minor"], ["rides", "total_minor"], ["lineman_order_details", "charged_minor"]] as const) {
        if (!kinds.includes(table)) continue;
        // `service` arrived with v15 (migration 049); a v10-v13 delivery row has no such key.
        const base: Record<string, unknown> = { ...valid[table] };
        delete base.service;
        const row = { ...base, [column]: "-1" };
        expect(messagesOf(rowSchemaOf(data, table), row), `${name} ${table}`).toContain(NEGATIVE);
      }
    }
  });
});

describe("B2: cross-field rules in the backup contract", () => {
  const SIGN = {
    components: "Component sign does not match its kind.",
    slip: "Slip sign does not match its kind.",
    cash: "Cash entry sign does not match its kind.",
    corrected: "Corrected sign does not match its kind.",
    card: "Notification card sign does not match its kind."
  } as const;

  const slip = { id: id(10), owner_id: ownerId, bank_code: "SCB", bank_qr_code: "014", slip_reference: "SYNTHSLIP0001",
    qr_payload: "synthetic-payload", kind: "withdrawal", amount_minor: "-5000", currency: "THB", occurred_on: "2026-09-01",
    occurred_at_time: null, counterparty: null, category_id: null, note: null, captured_at: at };
  const component = { id: id(11), owner_id: ownerId, transaction_id: id(12), position: 1, kind: "withdrawal", amount_minor: "-5000",
    currency: "THB", created_at: at };
  const cash = { id: id(13), owner_id: ownerId, kind: "withdrawal", amount_minor: "-5000", currency: "THB", occurred_on: "2026-09-01",
    occurred_at_time: null, counterparty: null, category_id: null, note: null, created_at: at };
  const card = { id: id(14), owner_id: ownerId, account_id: id(15), channel: "SCB Connect", printed_account_digits: "1234", kind: "withdrawal",
    amount_minor: "-5000", currency: "THB", occurred_on: "2026-09-01", occurred_at_time: "10:00", balance_minor: "100000", counterparty: null,
    category_id: null, note: null, fingerprint_version: "card-fingerprint-v1", fingerprint: "c".repeat(64), captured_at: at };
  const correction = (key: string) => ({ [key]: id(16), owner_id: ownerId, kind: "withdrawal", amount_minor: "-5000", occurred_on: null,
    occurred_at_time: null, counterparty: null, category_id: null, note: null, revision: 1, updated_at: at });

  const schema = (table: string) => rowSchemaOf(backupDataSchema, table);

  describe("sign must match kind", () => {
    it("accepts the valid rows these tests mutate", () => {
      expect(messagesOf(schema("source_components"), component)).toEqual([]);
      expect(messagesOf(schema("slips"), slip)).toEqual([]);
      expect(messagesOf(schema("cash_entries"), cash)).toEqual([]);
      expect(messagesOf(schema("notification_cards"), card)).toEqual([]);
      for (const [table, key] of [["cash_entry_overlays", "cash_entry_id"], ["slip_correction_overlays", "slip_id"], ["notification_card_correction_overlays", "card_id"]] as const) {
        expect(messagesOf(schema(table), { ...correction(key), ...(table === "notification_card_correction_overlays" ? { balance_minor: null } : {}) }), table).toEqual([]);
      }
    });

    it("source_components", () => {
      expect(messagesOf(schema("source_components"), { ...component, amount_minor: "5000" })).toEqual([SIGN.components]);
      expect(messagesOf(schema("source_components"), { ...component, kind: "deposit", amount_minor: "-5000" })).toEqual([SIGN.components]);
      expect(messagesOf(schema("source_components"), { ...component, amount_minor: "0" })).toEqual([SIGN.components]);
    });

    it("slips", () => {
      expect(messagesOf(schema("slips"), { ...slip, amount_minor: "5000" })).toEqual([SIGN.slip]);
      expect(messagesOf(schema("slips"), { ...slip, kind: "deposit", amount_minor: "-5000" })).toEqual([SIGN.slip]);
    });

    it("cash_entries", () => {
      expect(messagesOf(schema("cash_entries"), { ...cash, amount_minor: "5000" })).toEqual([SIGN.cash]);
      expect(messagesOf(schema("cash_entries"), { ...cash, kind: "deposit", amount_minor: "-5000" })).toEqual([SIGN.cash]);
    });

    it("notification_cards", () => {
      expect(messagesOf(schema("notification_cards"), { ...card, amount_minor: "5000" })).toEqual([SIGN.card]);
      expect(messagesOf(schema("notification_cards"), { ...card, kind: "deposit", amount_minor: "-5000" })).toEqual([SIGN.card]);
    });

    it.each([
      ["cash_entry_overlays", "cash_entry_id", {}],
      ["slip_correction_overlays", "slip_id", {}],
      ["notification_card_correction_overlays", "card_id", { balance_minor: null }]
    ] as const)("%s (the shared correction overlay)", (table, key, extra) => {
      const base = { ...correction(key), ...extra };
      expect(messagesOf(schema(table), { ...base, amount_minor: "5000" })).toEqual([SIGN.corrected]);
      expect(messagesOf(schema(table), { ...base, kind: "deposit", amount_minor: "-5000" })).toEqual([SIGN.corrected]);
      // The sibling rule: an amount and its kind arrive together.
      expect(messagesOf(schema(table), { ...base, kind: null })).toEqual(["A corrected amount and its kind must be present together."]);
    });
  });

  describe("a matched decision must name a transaction", () => {
    const MATCH = "A matched decision must name a transaction, and an unmatched one must not.";
    const CARD_MATCH = "A matched decision must name a transaction, and the other two must not.";
    // The six copies differ in key column, and the card's differs in message, so each gets a case.
    const copies = [
      ["slip_match_overlays", "slip_id", MATCH],
      ["receipt_match_overlays", "receipt_id", MATCH],
      ["delivery_match_overlays", "delivery_id", MATCH],
      ["ride_match_overlays", "ride_id", MATCH],
      ["shopee_payment_match_overlays", "order_id", MATCH]
    ] as const;

    it.each(copies)("%s", (table, key, message) => {
      const matched = { [key]: id(20), owner_id: ownerId, decision: "matched", transaction_id: id(21), revision: 1, updated_at: at };
      expect(messagesOf(schema(table), matched)).toEqual([]);
      expect(messagesOf(schema(table), { ...matched, transaction_id: null })).toEqual([message]);
      expect(messagesOf(schema(table), { ...matched, decision: "unmatched" })).toEqual([message]);
      expect(messagesOf(schema(table), { ...matched, decision: "unmatched", transaction_id: null })).toEqual([]);
    });

    it("notification_card_decision_overlays, whose message names three decisions", () => {
      const matched = { card_id: id(22), owner_id: ownerId, decision: "matched", transaction_id: id(23), accepted_balance_mismatch: false, revision: 1, updated_at: at };
      const table = "notification_card_decision_overlays";
      expect(messagesOf(schema(table), matched)).toEqual([]);
      expect(messagesOf(schema(table), { ...matched, transaction_id: null })).toEqual([CARD_MATCH]);
      expect(messagesOf(schema(table), { ...matched, decision: "unmatched" })).toEqual([CARD_MATCH]);
      expect(messagesOf(schema(table), { ...matched, decision: "not-a-payment" })).toEqual([CARD_MATCH]);
    });
  });

  describe("only a matched decision may accept a balance mismatch", () => {
    const table = "notification_card_decision_overlays";
    const MISMATCH = "Only a matched decision can accept a balance mismatch.";
    const matched = { card_id: id(22), owner_id: ownerId, decision: "matched", transaction_id: id(23), accepted_balance_mismatch: true, revision: 1, updated_at: at };

    it("accepts the pair on a matched decision", () => {
      expect(messagesOf(schema(table), matched)).toEqual([]);
    });

    it.each(["unmatched", "not-a-payment"])("refuses it on %s", (decision) => {
      expect(messagesOf(schema(table), { ...matched, decision, transaction_id: null })).toEqual([MISMATCH]);
    });
  });

  describe("sequences", () => {
    const sequence = { owner_id: ownerId, sequence: "7", last_exported_sequence: "7", updated_at: at };

    it("refuses an exported sequence beyond the mutation sequence", () => {
      expect(messagesOf(schema("mutation_sequences"), sequence)).toEqual([]);
      expect(messagesOf(schema("mutation_sequences"), { ...sequence, last_exported_sequence: "8" })).toEqual(["Exported sequence cannot exceed the mutation sequence."]);
    });

    function snapshotWith(snapshotSequence: string) {
      const data = Object.fromEntries(BACKUP_TABLE_KINDS.map((kind) => [kind, []])) as Record<string, unknown[]>;
      data.mutation_sequences = [{ ...sequence, last_exported_sequence: "0" }];
      const tableCounts = Object.fromEntries(BACKUP_TABLE_KINDS.map((kind) => [kind, data[kind]!.length]));
      return { schemaVersion: 16, exportedAt: at, snapshotSequence, tableCounts, data };
    }

    it("refuses a snapshot sequence that differs from the mutation-sequence row", () => {
      expect(backupSnapshotSchemaV16.safeParse(snapshotWith("7")).success).toBe(true);
      const result = backupSnapshotSchemaV16.safeParse(snapshotWith("8"));
      expect(result.success).toBe(false);
      expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual(["Snapshot sequence does not match the mutation-sequence row."]);
    });
  });
});

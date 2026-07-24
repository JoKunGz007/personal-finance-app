import type { ImportPayload } from "@/lib/statement";

export const SYNTHETIC_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

export const syntheticImport: ImportPayload = {
  contractVersion: "krungthai-layout-v1",
  fingerprintVersion: "fingerprint-v1",
  accountId: SYNTHETIC_ACCOUNT_ID,
  bankCode: "KTB",
  currency: "THB",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  openingBalance: { minor: "1250000", currency: "THB" },
  closingBalance: { minor: "1375012", currency: "THB" },
  rows: [
    {
      sourceDate: "2026-06-03", sourceTime: "09:24", effectiveDate: "2026-06-03",
      transactionLabel: "เงินโอนเข้า", description: "Synthetic salary transfer", reference: "SYN-0603-01", branch: null,
      components: [{ kind: "deposit", amount: { minor: "250000", currency: "THB" } }],
      postBalance: { minor: "1500000", currency: "THB" }, provenance: { page: 1, row: 1, parserFields: { fixture: true } }
    },
    {
      sourceDate: "2026-06-08", sourceTime: "18:42", effectiveDate: "2026-06-08",
      transactionLabel: "ชำระสินค้า", description: "Synthetic neighbourhood market", reference: "SYN-0608-02", branch: "Mobile",
      components: [{ kind: "withdrawal", amount: { minor: "-78550", currency: "THB" } }],
      postBalance: { minor: "1421450", currency: "THB" }, provenance: { page: 1, row: 2, parserFields: { fixture: true } }
    },
    {
      sourceDate: "2026-06-14", sourceTime: null, effectiveDate: "2026-06-14",
      transactionLabel: "ถอนเงิน", description: "Synthetic cash withdrawal", reference: "SYN-0614-03", branch: "Demo branch",
      components: [{ kind: "withdrawal", amount: { minor: "-32000", currency: "THB" } }],
      postBalance: { minor: "1389450", currency: "THB" }, provenance: { page: 1, row: 3, parserFields: { fixture: true } }
    },
    {
      sourceDate: "2026-06-25", sourceTime: null, effectiveDate: "2026-06-25",
      transactionLabel: "ดอกเบี้ย / ภาษี", description: "Synthetic interest and withholding tax", reference: "SYN-0625-04", branch: null,
      components: [
        { kind: "deposit", amount: { minor: "1250", currency: "THB" } },
        { kind: "withdrawal", amount: { minor: "-188", currency: "THB" } }
      ],
      postBalance: { minor: "1390012", currency: "THB" }, provenance: { page: 2, row: 1, parserFields: { fixture: true, anomaly: "interest-tax-order" } }
    },
    {
      sourceDate: "2026-06-29", sourceTime: "07:10", effectiveDate: "2026-06-29",
      transactionLabel: "ค่าบริการ", description: "Synthetic monthly service", reference: "SYN-0629-05", branch: null,
      components: [{ kind: "withdrawal", amount: { minor: "-15000", currency: "THB" } }],
      postBalance: { minor: "1375012", currency: "THB" }, provenance: { page: 2, row: 2, parserFields: { fixture: true } }
    }
  ]
};

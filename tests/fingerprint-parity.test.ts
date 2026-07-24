import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { rowFingerprint } from "@/lib/canonical";
import { syntheticImport } from "@/lib/synthetic";
import type { SourceRowCandidate } from "@/lib/statement";

// confirm_import recomputes each row's fingerprint in PostgreSQL and raises
// `fingerprint mismatch` when the caller's claim differs (migration 202607240008,
// DECISIONS D-014). That makes JS/PostgreSQL agreement load-bearing: if the two
// normalizers ever diverge, every import fails closed. The pgTAP suite computes
// fingerprints server-side, so it proves the SQL is self-consistent, not that the
// client agrees with it — this test closes that gap by hashing the same rows with
// the real lib/canonical.ts and comparing against private.row_fingerprint.
//
// private.row_fingerprint is revoked from anon/authenticated, so it is reached over
// psql in the local Supabase container rather than through the API.
const CONTAINER = "supabase_db_private-ledger-local";
const ACCOUNT = syntheticImport.accountId;

function psql(sql: string): string | null {
  try {
    return execFileSync(
      "docker",
      ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch {
    return null;
  }
}

const reachable = psql("select 1;") !== null;

// Rows chosen to stress the parts of the fingerprint most likely to diverge: Thai
// script, NFKC-foldable and whitespace-heavy text, null optional fields, compound
// component sums, and the int64 boundary.
const cases: Array<[string, Record<string, unknown>]> = [
  ["synthetic-first-row", syntheticImport.rows[0] as unknown as Record<string, unknown>],
  ["thai-text", {
    sourceDate: "2026-01-05", sourceTime: "08:00:00", effectiveDate: "2026-01-05",
    transactionLabel: "โอนเงิน", description: "รายการโอนเงินเข้าบัญชี",
    reference: "อ้างอิง-99", branch: "สาขาสีลม",
    components: [{ kind: "deposit", amount: { minor: "123456", currency: "THB" } }],
    postBalance: { minor: "133556", currency: "THB" }
  }],
  ["messy-whitespace", {
    sourceDate: "2026-01-06", sourceTime: "10:10:10", effectiveDate: "2026-01-06",
    transactionLabel: "  Ａ   ﬁle\ttab ", description: "line\nbreak nbsp ideo　 ",
    reference: " ref em ", branch: "﻿bom﻿",
    components: [{ kind: "deposit", amount: { minor: "1", currency: "THB" } }],
    postBalance: { minor: "133557", currency: "THB" }
  }],
  ["null-optionals", {
    sourceDate: "2026-01-03", sourceTime: null, effectiveDate: "2026-01-03",
    transactionLabel: "No reference", description: "Row without reference or branch",
    reference: null, branch: null,
    components: [{ kind: "withdrawal", amount: { minor: "-250", currency: "THB" } }],
    postBalance: { minor: "9850", currency: "THB" }
  }],
  ["compound-sums", {
    sourceDate: "2026-01-04", sourceTime: "23:59", effectiveDate: "2026-01-04",
    transactionLabel: "Interest and tax", description: "Compound row",
    reference: null, branch: "MAIN",
    components: [
      { kind: "deposit", amount: { minor: "500", currency: "THB" } },
      { kind: "withdrawal", amount: { minor: "-75", currency: "THB" } }
    ],
    postBalance: { minor: "10275", currency: "THB" }
  }],
  ["int64-boundary", {
    sourceDate: "2026-01-07", sourceTime: null, effectiveDate: "2026-01-07",
    transactionLabel: "Big", description: "Near int64 boundary",
    reference: null, branch: null,
    components: [{ kind: "deposit", amount: { minor: "9223372036854775807", currency: "THB" } }],
    postBalance: { minor: "9223372036854775807", currency: "THB" }
  }]
];

describe.skipIf(!reachable)("row fingerprint parity between lib/canonical.ts and PostgreSQL", () => {
  it("derives an identical fingerprint for every row", async () => {
    // Hex-encode so no statement text has to survive shell or SQL quoting.
    const selects = cases.map(([name, row]) => {
      const hex = Buffer.from(JSON.stringify(row), "utf8").toString("hex");
      return `select '${name}', private.row_fingerprint('${ACCOUNT}', 'KTB', convert_from(decode('${hex}','hex'),'UTF8')::jsonb)`;
    });

    const output = psql(`${selects.join("\nunion all\n")};`);
    expect(output, "psql query failed").not.toBeNull();

    const fromDatabase = new Map(
      output!.trim().split("\n").filter(Boolean).map((line) => {
        const [name, fingerprint] = line.split("\t");
        return [name!.trim(), fingerprint!.trim()] as const;
      })
    );

    for (const [name, row] of cases) {
      const expected = await rowFingerprint(ACCOUNT, "KTB", row as unknown as SourceRowCandidate);
      expect(fromDatabase.get(name), `${name}: no fingerprint returned`).toBeDefined();
      expect(fromDatabase.get(name), `${name}: PostgreSQL and JS disagree`).toBe(expected);
    }
  });
});

it.skipIf(reachable)("reports that fingerprint parity was not verified", () => {
  console.warn(
    `Skipped JS/PostgreSQL fingerprint parity: container ${CONTAINER} is unreachable. ` +
    "Run `pnpm supabase:start` to exercise it — a skipped run proves nothing about migration 008."
  );
  expect(reachable).toBe(false);
});

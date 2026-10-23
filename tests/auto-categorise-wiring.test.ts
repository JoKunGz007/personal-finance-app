import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// D-245 step 4: the auto-categoriser runs only after the exclusion it depends on (an own transfer
// is categorised from `include_in_reporting = false`), on both paths that run it. Asserted on the
// source order, because neither path has a rendering or database harness in Vitest.
const source = (file: string) => readFileSync(file, "utf8");

describe("auto-categoriser wiring", () => {
  it("the ledger starts it only after the snapshot is committed (it holds the auto-excluded answer), and reloads only when it wrote", () => {
    const view = source("app/transactions-view.tsx");
    const committed = view.indexOf("setLedgerWindow(snapshot.window);");
    const categorised = view.indexOf('ledgerRequest("/api/v1/transactions/auto-categorised"');
    expect(committed).toBeGreaterThan(-1);
    expect(categorised).toBeGreaterThan(committed);
    expect(view.indexOf('"/api/v1/transactions/auto-categorised"')).toBe(view.lastIndexOf('"/api/v1/transactions/auto-categorised"'));
    expect(view).toMatch(/categorised\.ok && categorised\.data\.applied > 0\) void load\(automatic\)/u);
    // D-293: the loader is read-only, so the write cannot start before the exclusion it depends on is read.
    expect(source("lib/browser/ledger-snapshot.ts")).not.toContain("auto-categorised");
  });

  it("an import runs it after auto_exclude_internal_transfers and swallows its failure", () => {
    const confirm = source("lib/server/confirm-import.ts");
    const excluded = confirm.indexOf('await client.rpc("auto_exclude_internal_transfers");');
    const categorised = confirm.indexOf("await autoCategorise(");
    expect(excluded).toBeGreaterThan(-1);
    expect(categorised).toBeGreaterThan(excluded);
    expect(confirm.slice(excluded, categorised)).toMatch(/try \{/u);
  });
});

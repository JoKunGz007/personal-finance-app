import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("privacy guardrails", () => {
  it("does not expose statement password environment variables", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/STATEMENT_PASSWORD|SCB_|KBANK_|KRUNGTHAI_STATEMENT/);
  });

  it("does not register a service worker or install observation tooling", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const ui = readFileSync("app/ledger-app.tsx", "utf8");
    expect(ui).not.toMatch(/serviceWorker|localStorage|sessionStorage|console\./);
    expect(packageJson).not.toMatch(/analytics|sentry|datadog|hotjar|fullstory/i);
  });

  it("keeps API and page responses no-store", () => {
    expect(readFileSync("next.config.ts", "utf8")).toContain('value: "no-store"');
    expect(readFileSync("app/api/v1/imports/confirm/route.ts", "utf8")).not.toMatch(/password|pdfBytes|ArrayBuffer/);
  });

  it("routes financial boundaries through owner-bound RPCs", () => {
    expect(readFileSync("app/api/v1/backups/export/route.ts", "utf8")).toContain('rpc("export_backup_snapshot")');
    expect(readFileSync("app/api/v1/categories/route.ts", "utf8")).toContain('rpc("mutate_category"');
    expect(readFileSync("app/api/v1/accounts/[id]/transactions/route.ts", "utf8")).toContain('rpc("list_account_transactions"');
  });

  it("does not regress backup export to capped table selects", () => {
    const route = readFileSync("app/api/v1/backups/export/route.ts", "utf8");
    expect(route).not.toMatch(/from\(.+\)\.select/);
    expect(route).toContain("p_expected_sequence");
  });

  it("keeps the PDF password and raw page text inside the parser worker", () => {
    const worker = readFileSync("workers/krungthai.worker.ts", "utf8");
    // Only extracted rows, the frame, or a typed error code may cross back. Posting
    // page text or the password would put arbitrary document content on the main
    // thread, where it can reach the DOM or an error report.
    // Assert on identifiers, not incidental words: a user-facing message may
    // legitimately mention a password, so string literals are stripped before the
    // check. What must never be posted is the value itself.
    const withoutLiterals = worker.replace(/"(?:[^"\\]|\\.)*"/gu, '""').replace(/`(?:[^`\\]|\\.)*`/gu, "``");
    expect(withoutLiterals).not.toMatch(/postMessage\([^)]*\b(ephemeralPassword|password|bytes|pages|content|items)\b/su);
    expect(worker).toMatch(/ephemeralPassword = ""/);
  });

  it("keeps every client request same-origin and limited to the import contract", () => {
    const ui = readFileSync("app/ledger-app.tsx", "utf8");
    const targets = [...ui.matchAll(/fetch\(\s*"([^"]+)"/gu)].map((match) => match[1]!);
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach((target) => expect(target).toMatch(/^\/api\/v1\//u));
    // The confirmation body is the contract and nothing else. The document password
    // and the PDF bytes must never be serialized into a request; only the artifact
    // digest, which cannot be reversed into statement content, describes the file.
    const body = /JSON\.stringify\(\{ idempotencyKey[^)]*\)/su.exec(ui)?.[0] ?? "";
    expect(body).toBe("JSON.stringify({ idempotencyKey, artifactDigest, payload: statement })");
  });

  it("never infers which ledger account a statement belongs to", () => {
    const ui = readFileSync("app/ledger-app.tsx", "utf8");
    // Binding is a checked user decision (DECISIONS D-017): the account id comes from
    // the chooser, and assembleImportPayload re-checks it against the printed account
    // and currency. Matching an account to the statement automatically — however
    // convenient — would make a parser reading the ledger's routing decision.
    expect(ui).toContain("assembleImportPayload(");
    expect(ui).toContain("accounts?.find((item) => item.id === chosenAccountId)");
    expect(ui).not.toMatch(/find\([^)]*accountLastFour/u);
  });

  it("does not widen the accounts listing beyond the chooser's needs", () => {
    const route = readFileSync("app/api/v1/accounts/route.ts", "utf8");
    // An explicit column list, never select("*"): a future column must be opted into.
    expect(route).toContain('.select("id,bank_code,label,account_type,last_four,currency,timezone")');
    expect(route).not.toMatch(/select\(\s*"\*"/u);
  });

  it("reduces the account number to its last four digits inside the parser", () => {
    const layout = readFileSync("lib/krungthai-layout.ts", "utf8");
    // The extracted frame must never carry a full account number, so no later code
    // path, log line, or error message can leak one.
    const frameType = /export type StatementFrame = \{[^}]*\}/su.exec(layout)?.[0] ?? "";
    expect(frameType).toContain("accountLastFour");
    expect(frameType).not.toMatch(/accountNumber/u);
    expect(layout).toMatch(/slice\(-4\)/);
  });
});

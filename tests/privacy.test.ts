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
    // The layout diagnostic may only cross as the reducer's output. Posting anything
    // else derived from `pages` would defeat the check above by renaming a local.
    expect(worker).toMatch(/const labelCandidates = describeLabelGeometry\(pages\);/);
    expect(withoutLiterals).not.toMatch(/labelCandidates\s*:/u);
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

  it("keeps digits out of the layout diagnostic entirely", async () => {
    const { describeLabelGeometry } = await import("@/lib/krungthai-layout");
    const { validStatement } = await import("./fixtures/krungthai-layout-v1");
    // The diagnostic exists so a real statement's heading words can repair the reader
    // without anyone reading the statement. Every amount, balance, date, time, account
    // number, and reference contains a digit, so excluding digit-bearing runs makes it
    // structurally unable to carry financial values — this asserts that property over
    // the full invented statement, whose rows are dense with money.
    const described = describeLabelGeometry(validStatement);
    expect(described.length).toBeGreaterThan(0);
    const flattened = described.flat().join(" ");
    expect(flattened).not.toMatch(/\p{Nd}/u);
    // The headings survive, so the diagnostic is actually useful — this is exactly the
    // information that repaired the reader after the 2026-07-25 smoke test.
    expect(flattened).toContain("Date/Time");
    expect(flattened).toContain("Description/Cheque No.");
    // A sparse line — a name or address rather than a heading row — is not reported.
    expect(describeLabelGeometry([[{ str: "นายสังเคราะห์ ทดสอบ", x: 40, y: 700 }]])).toEqual([]);
  });

  it("reports only labels whose value is a number, never ones naming a person", async () => {
    const { describeValueLabels } = await import("@/lib/krungthai-layout");
    const { validStatement } = await import("./fixtures/krungthai-layout-v1");
    // This diagnostic exists to reveal the frame label wording, which sits on lines the
    // label diagnostic drops. A label qualifies only when the run immediately right of it
    // carries a digit, so an account number or balance label is reported while
    // `Account Name` — whose value is text — cannot be.
    const labels = describeValueLabels(validStatement);
    expect(labels).toContain("Account Number");
    expect(labels).toContain("Statement Period");
    expect(labels.join(" ")).not.toMatch(/\p{Nd}/u);

    const withName: Array<Array<{ str: string; x: number; y: number }>> = [[
      { str: "Account Name", x: 40, y: 760 },
      { str: "Synthetic Owner", x: 170, y: 760 },
      { str: "Account No.", x: 40, y: 750 },
      { str: "123-4-56789-0", x: 170, y: 750 }
    ]];
    const reported = describeValueLabels(withName);
    expect(reported).toContain("Account No.");
    expect(reported).not.toContain("Account Name");
    // And the name itself never appears, as a label or otherwise.
    expect(reported.join(" ")).not.toContain("Synthetic Owner");
  });

  it("reduces the structural dump to shapes with no value surviving", async () => {
    const { describeStructure } = await import("@/lib/krungthai-layout");
    const { validStatement } = await import("./fixtures/krungthai-layout-v1");
    const dumped = describeStructure(validStatement);
    expect(dumped.length).toBeGreaterThan(0);

    // Each reported run is `<shape>@<x>`. The shape may hold only `d`, `x`, punctuation,
    // symbols and spacing — never a digit or any other letter — so no amount, balance,
    // date, account number, name, or description word can survive it.
    for (const line of dumped) {
      if (line.startsWith("---")) continue; // the last-page separator
      const cells = line.replace(/^p\d+ y=-?\d+\s+/u, "").split("  ").filter(Boolean);
      for (const cell of cells) {
        const shape = cell.slice(0, cell.lastIndexOf("@"));
        expect(shape, `unmasked run in: ${line}`).toMatch(/^[dx\p{P}\p{S}\p{Z}]*$/u);
      }
    }

    // Spot-check that real-looking values from the fixture are genuinely gone.
    const joined = dumped.join("\n");
    for (const value of ["10,000.00", "1,000.00", "Savings", "Krungthai", "56789", "02/01/69"]) {
      expect(joined).not.toContain(value);
    }
    // Structure is still there: the header line keeps seven runs, and formats show through.
    expect(joined).toMatch(/dd\/dd\/dd/u);
    expect(joined).toMatch(/d,ddd\.dd/u);
  });

  it("never interpolates raw cell text into a layout error message", () => {
    const layout = readFileSync("lib/krungthai-layout.ts", "utf8");
    // Layout failure messages now reach the UI (the worker forwards result.message), so
    // they are a disclosure boundary. A cell's text may only appear through maskShape;
    // interpolating textOf(...) or item.str directly would put statement content into a
    // status line. Only template literals are checked, since that is the only way a
    // value can reach a message.
    const templates = layout.match(/`(?:[^`\\]|\\.)*`/gu) ?? [];
    const interpolations = templates.flatMap((template) => template.match(/\$\{[^}]*\}/gu) ?? []);
    expect(interpolations.length).toBeGreaterThan(0);
    for (const interpolation of interpolations) {
      if (!/textOf\(|item\.str|\.str\b|cells\[|dateText|printedDateTime|withdrawalText|depositText/u.test(interpolation)) continue;
      expect(interpolation, `unmasked cell text in a message: ${interpolation}`).toMatch(/maskShape\(/u);
    }
  });

  it("reduces a rejected row to shapes, with no value or wording surviving", async () => {
    const { extractStatement } = await import("@/lib/krungthai-layout");
    const { buildPage } = await import("./fixtures/krungthai-layout-v1");
    // A rejected row's message reaches the UI, and it is the only diagnostic that reports
    // a *row* rather than a heading or a structure — so it is the one most likely to carry
    // an amount or a counterparty. The static guard above checks that no unmasked cell is
    // interpolated; this checks the produced message, which also covers the dump being
    // built by a helper whose name says nothing about cell text.
    const result = extractStatement([buildPage([
      {
        date: "02/01/69", time: "09:15", label: "ถอนเงินสด", detail: "Synthetic branch withdrawal",
        withdrawal: "0.00", balance: "10,000.00", branch: "สาขาสีลม"
      }
    ])]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_ROW_CONTENT");

    // Every column is reported as `key[shape]`, and a shape may hold only `d`, `x`,
    // punctuation, symbols and spacing — never a digit or any other letter.
    const reported = [...result.message.matchAll(/([A-Za-z]+)\[([^\]]*)\]/gu)];
    expect(reported).toHaveLength(7);
    for (const [, , shape] of reported) {
      expect(shape, `unmasked run in: ${result.message}`).toMatch(/^[dx\p{P}\p{S}\p{Z}]*$/u);
    }
    // Past the parser's own counters — the failure count, the distinct-class count, and the
    // page/row provenance, none of which come from the document — nothing in the message may
    // carry a digit or a Thai character, so no amount, balance, date, time, branch name or
    // transaction wording can survive it.
    const reportedContent = result.message
      .replace(/^\d+ rows? could not be read(?:, in \d+ distinct cases?)?\. /u, "")
      .replace(/\d+× /gu, "")
      .replace(/Page \d+ row (?:\d+|—): /gu, "");
    expect(reportedContent).not.toMatch(/\p{Nd}/u);
    expect(reportedContent).not.toMatch(/\p{Script=Thai}/u);
    for (const value of ["10,000.00", "0.00", "09:15", "02/01/69", "Synthetic branch withdrawal"]) {
      expect(result.message).not.toContain(value);
    }
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

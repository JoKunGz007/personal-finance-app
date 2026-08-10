import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/security-headers";

describe("privacy guardrails", () => {
  it("does not expose statement password environment variables", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/STATEMENT_PASSWORD|SCB_|KBANK_|KRUNGTHAI_STATEMENT/);
  });

  it("installs no observation tooling and keeps the ledger surfaces free of client storage", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const ui = readFileSync("app/import-bench.tsx", "utf8")
      + readFileSync("app/recovery-bench.tsx", "utf8")
      + readFileSync("app/transactions-view.tsx", "utf8")
      + readFileSync("app/captured-slips.tsx", "utf8")
      + readFileSync("app/slips-bench.tsx", "utf8");
    expect(ui).not.toMatch(/serviceWorker|localStorage|sessionStorage|console\./);
    expect(packageJson).not.toMatch(/analytics|sentry|datadog|hotjar|fullstory/i);
  });

  it("registers exactly one service worker, and it caches nothing but the shared slip", () => {
    // This test used to be part of a blanket "does not register a service worker" assertion
    // that checked only two UI files. Share-to-app then registered one in a third
    // (`app/slip-capture.tsx`, D-056) and the assertion went on passing while its own name
    // had become false. The rule was never "no service worker" — it is that a worker exists
    // for one reason and must not become an app-shell cache, because a stale one serving
    // old code is among the hardest failures here to diagnose.
    //
    // Routing moved the registration from the capture form to the shell so that any visited
    // route arms the share interceptor, not only the one a share lands on — the rule is one
    // registration site, and it is still one. The candidate list is every client component
    // in `app/`, so a second registration anywhere fails this rather than hiding.
    const registrations = [
      "app/site-header.tsx", "app/slip-capture.tsx", "app/import-bench.tsx",
      "app/recovery-bench.tsx", "app/transactions-view.tsx", "app/layout.tsx",
      "app/captured-slips.tsx", "app/slips-bench.tsx"
    ].filter((file) => readFileSync(file, "utf8").includes("serviceWorker.register"));
    expect(registrations).toEqual(["app/site-header.tsx"]);

    const worker = readFileSync("public/share-slip-sw.js", "utf8");
    // One fetch handler, and it must return early for anything that is not the share POST.
    expect(worker.match(/addEventListener\("fetch"/gu)).toHaveLength(1);
    expect(worker).toMatch(/method !== "POST"/u);
    // No precache list, no cache-first read path: the only cache write is the shared image.
    expect(worker).not.toMatch(/cache\.addAll|caches\.match\(event\.request\)|cache-first/u);
    expect(worker.match(/cache\.put\(/gu)).toHaveLength(1);
  });

  it("keeps API and page responses no-store", () => {
    // Asserted against the header the app actually builds rather than against a string in
    // `next.config.ts`. The literal moved to `lib/security-headers.ts` when `connect-src`
    // stopped being a constant, and a grep for it would have gone on passing while pointing
    // at the wrong file — or, as it did, failed for a reason that says nothing about privacy.
    const headers = new Map(securityHeaders("http://127.0.0.1:54321").map((header) => [header.key, header.value]));
    expect(headers.get("Cache-Control")).toBe("no-store");
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
    // The successful parse now carries the same diagnostic when the statement's totals
    // never confirmed its rows (D-043), on identical terms: reduced to a local before the
    // post, so `pages` never appears inside a postMessage call.
    expect(worker).toMatch(/const summaryLabels = result\.frame\.crossChecked \? \[\] : describeValueLabels\(pages\);/);
    expect(withoutLiterals).not.toMatch(/valueLabels\s*:\s*describe/u);
  });

  it("keeps every client request same-origin and limited to the import contract", () => {
    // Every client surface that fetches, not just the one that used to be the whole app:
    // routing split `app/ledger-app.tsx` into these three, and a check naming one file would
    // have gone on passing while saying nothing about the other two.
    const ui = readFileSync("app/import-bench.tsx", "utf8")
      + readFileSync("app/recovery-bench.tsx", "utf8")
      + readFileSync("app/site-header.tsx", "utf8");
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
    const ui = readFileSync("app/import-bench.tsx", "utf8");
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

  it("masks a character that decoded to a symbol rather than letting it through", async () => {
    const { maskShape } = await import("@/lib/krungthai-layout");
    // A real KBANK statement embeds subset fonts with no usable ToUnicode map, so pdf.js
    // resolves its Thai glyphs to arbitrary code points — arrows, fractions, brackets.
    // Those are neither letters nor digits, so the old "keep everything else" rule passed
    // them through verbatim. Unreadable, but a deterministic remapping of real content.
    const misdecoded = "⤎x xxd⁄d⏟ ®£¤¢¬⛤⺃";
    const masked = maskShape(misdecoded);
    for (const character of "⤎⁄⏟®£¤¢¬⛤⺃") {
      expect(masked, `mis-decoded glyph survived masking: ${character}`).not.toContain(character);
    }
    // Format-bearing punctuation still survives, or the shapes stop being readable.
    expect(maskShape("01/01/26 09:15")).toBe("dd/dd/dd dd:dd");
    expect(maskShape("1,234.56")).toBe("d,ddd.dd");
    expect(maskShape("123-456789-0")).toBe("ddd-dddddd-d");
    expect(maskShape("TOTAL (Debit)")).toBe("xxxxx (xxxxx)");
  });

  it("never reports a transaction row, however heading-shaped it looks", async () => {
    const { describeLabelGeometry } = await import("@/lib/krungthai-layout");
    // The shape that actually leaked on 2026-07-25. A real SCB statement prints every
    // transaction as `<code> | DESC : | <counterparty>` — three short digit-free items,
    // which the old density rule could not tell from a heading. Real merchant names
    // reached a masked dump as a result.
    //
    // Invented stand-ins here, per docs/FIXTURE_POLICY.md; the real ones are not repeated
    // anywhere in this repository.
    const heading = [
      { str: "Date", x: 36, y: 649 }, { str: "Code", x: 91, y: 649 },
      { str: "Channel", x: 122, y: 649 }, { str: "Description/Note", x: 460, y: 649 }
    ];
    // A real row, complete with the date and amounts it necessarily carries. An earlier
    // version of this test omitted them, which is precisely why it passed against a rule
    // that did not hold: the fixture was easier to satisfy than the document.
    const row = (y: number, merchant: string) => [
      { str: "01/01/26 09:15", x: 30, y }, { str: "SIPI", x: 95, y },
      { str: "250.00", x: 206, y }, { str: "1,000.00", x: 364, y },
      { str: "DESC :", x: 394, y }, { str: merchant, x: 418, y }
    ];
    const reported = describeLabelGeometry([
      // The recurring counterparty sits at the same y on both pages — rows are on a fixed
      // pitch, so position alone cannot tell it from a running header.
      [...heading, ...row(603, "SYNTHETIC WALLET CO.,LTD."), ...row(579, "WWW.SYNTHETIC.EXAMPLE")],
      [...heading, ...row(603, "SYNTHETIC WALLET CO.,LTD."), ...row(555, "SYNTHETIC.EXAMPLE/BILL")]
    ]);

    const flattened = reported.flat().join(" ");
    expect(flattened).toContain("Description/Note");
    // Including the one that recurs: a frequent counterparty defeats repetition alone,
    // which is why the rule is repetition *at the same vertical position*.
    for (const merchant of ["SYNTHETIC WALLET CO.,LTD.", "WWW.SYNTHETIC.EXAMPLE", "SYNTHETIC.EXAMPLE/BILL", "DESC :"]) {
      expect(flattened, `counterparty survived the label diagnostic: ${merchant}`).not.toContain(merchant);
    }
    // A single page cannot demonstrate repetition, so it reports nothing at all rather
    // than falling back to the density rule.
    expect(describeLabelGeometry([[...heading, ...row(603, "SYNTHETIC WALLET CO.,LTD.")]])).toEqual([]);
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

  it("never interpolates raw run text into a descriptor-driven layout message", () => {
    const layout = readFileSync("lib/statement-layout.ts", "utf8");
    // Same boundary as the Krungthai check below, applied to the reader that now handles
    // two more layouts. Its messages reach the UI, so a run's text may only appear through
    // maskShape — `labelText(...)` and `.str` are the two ways raw text can be reached.
    const templates = layout.match(/`(?:[^`\\]|\\.)*`/gu) ?? [];
    const interpolations = templates.flatMap((template) => template.match(/\$\{[^}]*\}/gu) ?? []);
    expect(interpolations.length).toBeGreaterThan(0);
    for (const interpolation of interpolations) {
      if (!/labelText\(|item\.str|\.str\b|textOf\(|describeLine\(/u.test(interpolation)) continue;
      expect(interpolation, `unmasked run text in a message: ${interpolation}`)
        .toMatch(/maskShape\(|describeLine\(/u);
    }
    // describeLine is the only way a whole row reaches a message, and it must mask.
    const describeLine = /function describeLine\([\s\S]*?\n\}/u.exec(layout)?.[0] ?? "";
    expect(describeLine).toContain("maskShape(");
  });

  it("reduces a rejected row to shapes in the descriptor-driven reader", async () => {
    const { extractStatement } = await import("@/lib/statement-layout");
    const { buildScbPage } = await import("./fixtures/statement-layouts");
    // A rejected row's message reaches the UI, and it is the diagnostic most likely to
    // carry an amount or a counterparty. This is the produced message, not a static scan.
    const result = extractStatement([buildScbPage([
      {
        dateTime: "02/01/26 09:15", code: "E1", channel: "ENET",
        debit: "0.00", balance: "5,000.00", description: "Synthetic counterparty name"
      }
    ], { carryForward: "5,000.00" })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    // Every run is reported as `[shape]`, and a shape may hold only `d`, `x`, punctuation,
    // symbols and spacing — never a digit or any other letter.
    const reported = [...result.message.matchAll(/\[([^\]]*)\]/gu)];
    expect(reported.length).toBeGreaterThan(0);
    for (const [, shape] of reported) {
      expect(shape, `unmasked run in: ${result.message}`).toMatch(/^[dx\p{P}\p{S}\p{Z}]*$/u);
    }
    for (const value of ["5,000.00", "0.00", "09:15", "02/01/26", "Synthetic counterparty name", "ENET"]) {
      expect(result.message).not.toContain(value);
    }
  });

  it("reports a balance gap as a shape, never as a figure", async () => {
    const { extractStatement } = await import("@/lib/statement-layout");
    const { buildScbPage } = await import("./fixtures/statement-layouts");
    // The direction and carry-forward checks are the only places an *arithmetic* result
    // derived from real amounts reaches a message, so they are their own disclosure risk:
    // a gap is a figure the document never printed but which is computed from two that it
    // did. Both report through maskShape.
    const result = extractStatement([buildScbPage([
      { dateTime: "02/01/26 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,000.00", description: "Synthetic outbound" }
    ], { carryForward: "5,000.00" })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("AMBIGUOUS_ROW_DIRECTION");
    expect(result.message).not.toMatch(/\d[\d,]*\.\d\d/u);
    expect(result.message).toMatch(/[d,]+\.dd/u);
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

  it("keeps the masked diagnostics module dependency-free", () => {
    const diagnostics = readFileSync("lib/masked-diagnostics.ts", "utf8");
    // This is the privacy-critical surface, and `scripts/mask-statement.mjs` runs it
    // under plain Node against a real statement (D-035). Both properties depend on it
    // importing nothing: nothing it can reach can widen what it emits, and Node can load
    // it without alias resolution or a bundler. An import here would break both at once.
    expect(diagnostics).not.toMatch(/^\s*import\s/mu);
    expect(diagnostics).toMatch(/export function maskShape/u);
  });

  it("keeps the masking harness to diagnostics output and a stdin-only password", () => {
    const harness = readFileSync("scripts/mask-statement.mjs", "utf8");
    // The harness is the one thing in this repo that opens a real statement. It may write
    // only what the value-free diagnostics produce, so the dump it leaves on disk carries
    // no amount, balance, date, account number, name, or counterparty.
    expect(harness).toMatch(/await writeFile\(outputPath, renderDump\(\{[^)]*\}\), "utf8"\)/u);
    const render = /function renderDump\(\{[\s\S]*?\n\}/u.exec(harness)?.[0] ?? "";
    expect(render).toContain("describeStructure(pages)");
    expect(render).toContain("describeLabelGeometry(pages)");
    expect(render).toContain("describeValueLabels(pages)");
    // Nothing else from a page may reach the dump: `.str` is the raw run text, and
    // reading it here would put document content into a file rather than a shape.
    expect(render).not.toMatch(/\.str\b/u);
    // The password may arrive by stdin only. An argument is visible to every process on
    // the machine and lands in shell history, and an environment variable outlives the
    // run — and these passwords are identity-grade and non-rotatable (D-035).
    expect(harness).not.toMatch(/process\.env/u);
    expect(harness).toMatch(/readPassword\(/u);
    const withoutLiterals = harness.replace(/"(?:[^"\\]|\\.)*"/gu, '""').replace(/`(?:[^`\\]|\\.)*`/gu, "``");
    expect(withoutLiterals).not.toMatch(/password\s*=\s*(?:argv|positional|process\.argv)/u);
    expect(harness).toMatch(/password = ""/u);

    // Directory mode reports which document produced which dump, and a statement's file
    // name routinely carries the account number or the holder's name. Every name that
    // reaches a dump, stdout or stderr must go through maskName, and maskName through
    // maskShape.
    expect(harness).toMatch(/function maskName\(name\)\s*\{[\s\S]*?maskShape\(/u);

    // An allowlist, not a blacklist. A blacklist naming the path variables passes the
    // moment one is renamed — which is exactly what happened while this was written, so
    // the guard now fails closed on anything it has not been told is safe.
    const SAFE = new Set([
      "maskedName",   // the masked file name — the whole point
      "outputPath",   // a path this script chose, under masked-dumps/
      "inputPath",    // the argument the owner typed; echoing it discloses nothing new
      "message", "argument", "name",   // static text and pdf.js error class names
      "written", "files", "failures", "line", "opened", "DUMP_DIR"
    ]);
    const emitted = [...harness.matchAll(/(?:process\.std(?:out|err)\.write|failures\.push)\(([\s\S]*?)\);/gu)]
      .map((match) => match[1]!);
    expect(emitted.length).toBeGreaterThan(0);
    for (const call of emitted) {
      for (const interpolation of call.match(/\$\{[\s\S]*?\}/gu) ?? []) {
        const expression = interpolation.slice(2, -1).trim();
        const lead = /^([A-Za-z_$][\w$]*)/u.exec(expression)?.[1] ?? "";
        expect(SAFE.has(lead), `unallowed value in harness output: ${interpolation}`).toBe(true);
        // `files` and `opened` are allowed for `files.length` and a page count only —
        // never for the paths in the array or the page text inside the extraction.
        expect(expression, `path or page text in harness output: ${interpolation}`)
          .not.toMatch(/files\s*\[|\.pages\b|\bstr\b/u);
      }
    }
  });

  it("serves the OCR engine from this origin and never from a CDN", () => {
    const engine = readFileSync("lib/slip-ocr-engine.ts", "utf8");
    // tesseract.js resolves its worker, core and language data from jsdelivr when left alone.
    // `connect-src` would block that (D-058), but the policy is the backstop rather than the
    // reason: a finance app fetching executable code and a language model from a third party
    // at runtime has handed that party the page. No absolute URL may appear in this module at
    // all — not in a default, not in a comment, not as a fallback.
    expect(engine).not.toMatch(/https?:\/\//u);
    for (const option of ["workerPath", "corePath", "langPath"]) {
      expect(engine, `${option} must be set, or tesseract falls back to its CDN`)
        .toMatch(new RegExp(`${option}:\\s*"/tesseract`, "u"));
    }
    // The engine is the only file that may know tesseract exists, and it may only reach it
    // through a dynamic import — a static one would put 3.9 MB of core and language data into
    // the bundle of a page that mostly does not use it (the D-057 argument, at four times the
    // size). A value import elsewhere would defeat both properties.
    expect(engine).toMatch(/await import\("tesseract\.js"\)/u);
    expect(engine).not.toMatch(/^\s*import\s+\{[^}]*\}\s+from\s+"tesseract\.js"/mu);
    for (const file of ["app/slip-capture.tsx", "lib/slip-ocr.ts", "lib/slip-scan.ts"]) {
      expect(readFileSync(file, "utf8"), `${file} must not reach the engine directly`)
        .not.toMatch(/tesseract\.js/u);
    }
  });

  it("stores nothing on the device for OCR, language model included", () => {
    const engine = readFileSync("lib/slip-ocr-engine.ts", "utf8");
    // Left at its default, tesseract writes the traineddata into IndexedDB. It is not slip
    // content, but it is still client storage, and this app has none — the same rule that
    // makes the captured image itself transient (D-050).
    expect(engine).toMatch(/cacheMethod:\s*"none"/u);
    expect(engine).not.toMatch(/indexedDB|localStorage|sessionStorage|document\.cookie/u);
  });

  it("asks the build for exactly the assets the engine loads", () => {
    const engine = readFileSync("lib/slip-ocr-engine.ts", "utf8");
    const copy = readFileSync("scripts/copy-tesseract-assets.mjs", "utf8");
    const copied = [...copy.matchAll(/to:\s*"([^"]+)"/gu)].map((match) => match[1]!);
    expect(copied.length).toBeGreaterThan(0);

    // The trap this exists for: given a *directory*, tesseract feature-detects SIMD and asks
    // for `tesseract-core-simd-lstm.wasm.js`, a single-file variant the build does not copy —
    // a 404 on a file nobody named, at the point where the obvious suspect is the CSP. The
    // engine names the core file outright to skip detection, so the two lists must agree.
    const named = [...engine.matchAll(/"\/tesseract\/([^"]+)"/gu)].map((match) => match[1]!);
    expect(named.length).toBeGreaterThan(0);
    for (const asset of named) {
      expect(copied, `the engine loads ${asset}, which the build does not copy`).toContain(asset);
    }
    // `langPath` is a directory, and `gzip: true` makes the request `<lang>.traineddata.gz`.
    expect(engine).toMatch(/gzip:\s*true/u);
    expect(copied).toContain("tha.traineddata.gz");
  });

  it("never lets a machine-read digit reach the amount field", () => {
    const form = readFileSync("app/slip-capture.tsx", "utf8");
    const finder = /async function findAmountOnImage\(\)[\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(finder).toContain("locateAmount(");
    // **The decision D-087 turns on.** Digits came back unstable about one time in fifteen
    // across configurations, and at least one wrong figure passed the strict money grammar —
    // so a pre-filled amount would be indistinguishable from a correct one. The feature locates
    // the amount and the owner reads it. "Pre-fill it, they can always check" is the plausible
    // change that would quietly undo that, which is why it is asserted rather than commented.
    expect(finder).not.toMatch(/setAmount\(/u);
    expect(finder).not.toMatch(/proposeAmount|readAmount/u);
    // And the reader that returns a figure is not imported by the form at all.
    expect(form).not.toMatch(/proposeAmount/u);
  });

  it("keeps masked dumps out of git", () => {
    const ignored = readFileSync(".gitignore", "utf8");
    // A dump is value-free but describes a real document, so committing one would make
    // every fixture written afterwards non-invented (docs/FIXTURE_POLICY.md).
    expect(ignored).toMatch(/^masked-dumps\/$/mu);
    expect(ignored).toMatch(/^private-statements\/$/mu);
    // The tesseract assets are ~3.8 MB of binaries copied from node_modules at build time. In
    // git they would be a review surface nobody can read and would drift from the package
    // version they must match; the copy makes that match structural instead.
    expect(ignored).toMatch(/^public\/tesseract\/$/mu);
  });

  it("reduces the account number to its last four digits inside every parser", () => {
    // The extracted frame must never carry a full account number, so no later code path,
    // log line, or error message can leak one. The type is now shared by three readers
    // and lives in its own module; each reader has to do the reduction itself.
    const frame = readFileSync("lib/statement-frame.ts", "utf8");
    const frameType = /export type StatementFrame = \{[^}]*\}/su.exec(frame)?.[0] ?? "";
    expect(frameType).toContain("accountLastFour");
    expect(frameType).not.toMatch(/accountNumber/u);
    for (const reader of ["lib/krungthai-layout.ts", "lib/statement-layout.ts"]) {
      expect(readFileSync(reader, "utf8"), reader).toMatch(/slice\(-4\)/);
    }
  });
});

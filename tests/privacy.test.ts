import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/security-headers";

/**
 * Every `.ts` and `.tsx` under `app/`, found rather than listed.
 *
 * The service-worker test below used to carry a hardcoded array described in its own comment as
 * "every client component in `app/`". It had drifted — `app/cash-entry.tsx` and
 * `app/correction-form.tsx` were both added without joining it — so the test was checking a
 * shrinking fraction of the surface while claiming to check all of it. A list that has to be
 * maintained by hand to stay true is the same defect that comment was written about.
 *
 * **`.ts` joined `.tsx` when the ledger view was split.** `app/transactions-view.tsx` became six
 * files, one of them a plain `.ts` module of shared types and the date format
 * (`app/ledger-shared.ts`), and a walk that saw only `.tsx` would have stopped covering it on the
 * way past. The same split is why the client-storage check below stopped naming its files.
 */
function appSources(): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) found.push(full.split(path.sep).join("/"));
    }
  };
  walk("app");
  return found.sort();
}

/**
 * The one file allowed to name `serviceWorker`, excluded by name and with its reason.
 *
 * Registration is the shell's job so that any visited route arms the share interceptor, not only
 * the one a share lands on. Everything else under `app/` must be free of it and of every client
 * storage API.
 */
const SERVICE_WORKER_REGISTRAR = "app/site-header.tsx";

describe("privacy guardrails", () => {
  it("does not expose statement password environment variables", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/STATEMENT_PASSWORD|SCB_|KBANK_|KRUNGTHAI_STATEMENT/);
  });

  it("installs no observation tooling and keeps the ledger surfaces free of client storage", () => {
    // **Found rather than listed, since the ledger view became six files.** This named five of
    // them — including `app/transactions-view.tsx`, which then had its four row kinds, its
    // controls and its retired-cards panel moved into siblings. A check naming the old file would
    // have gone on passing while saying nothing about the ~940 lines of markup that left it, which
    // is precisely the drift the walk above was written about the first time.
    const packageJson = readFileSync("package.json", "utf8");
    const sources = appSources().filter((file) => file !== SERVICE_WORKER_REGISTRAR);
    expect(sources.length, "no sources found — the walk is looking in the wrong place").toBeGreaterThan(10);
    const ui = sources.map((file) => readFileSync(file, "utf8")).join("\n");
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
    // registration site, and it is still one. The candidate list is **found** rather than
    // written down, so a second registration anywhere under `app/` fails this rather than
    // hiding in a file nobody remembered to add.
    const candidates = appSources();
    expect(candidates.length, "no components found — the walk is looking in the wrong place").toBeGreaterThan(5);
    const registrations = candidates.filter((file) => readFileSync(file, "utf8").includes("serviceWorker.register"));
    expect(registrations).toEqual([SERVICE_WORKER_REGISTRAR]);

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

  it("never infers a ledger account when many statements are opened at once", () => {
    // Bulk import makes the inference D-017 forbids far more tempting than a single import does:
    // a statement prints a bank code and four digits, `public.accounts` is unique on
    // (owner_id, bank_code, last_four), so a lookup would resolve unambiguously every time and
    // would save a choice per statement. It is still the ledger's routing decision.
    //
    // Asserted on the policy layer as well as the component, because the structural version of
    // the promise is that the module has no account to reach for: nothing in it takes a list.
    const policy = readFileSync("lib/statement-batch.ts", "utf8");
    const ui = readFileSync("app/statement-batch.tsx", "utf8");
    for (const source of [policy, ui]) {
      expect(source).not.toMatch(/accountListSchema|LedgerAccount|accounts\b\s*[:.]/u);
      expect(source).not.toMatch(/find\([^)]*accountLastFour/u);
    }
    // Binding stays where it already was. The batch hands a parse to the stage machine and the
    // owner chooses there, so a batched statement reaches the ledger by the one path that is
    // already covered rather than by a second one.
    // The call shape, not the name: both files discuss `assembleImportPayload` in prose, and a
    // check that forbids naming it would force the reasoning out of the comments to stay green.
    expect(ui).not.toMatch(/assembleImportPayload\s*\(/u);
    expect(policy).not.toMatch(/assembleImportPayload\s*\(/u);
  });

  it("sends nothing anywhere while reading a batch of statements", () => {
    // Statement import is the only path in this app that reads entirely on the device (D-128,
    // D-129) — slips and notification cards both go to Google Cloud Vision. Opening many
    // statements at once is exactly where that would erode quietly, so it is asserted rather
    // than intended: no request of any kind is constructed in either file.
    const policy = readFileSync("lib/statement-batch.ts", "utf8");
    const ui = readFileSync("app/statement-batch.tsx", "utf8");
    for (const source of [policy, ui]) {
      expect(source).not.toMatch(/\bfetch\s*\(/u);
      expect(source).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon|WebSocket|EventSource/u);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/u);
    }
    // The password reaches the worker and nothing else. It is never serialized, never digested
    // into anything kept, and never put in a message that outlives the parse.
    expect(ui).toMatch(/worker\.postMessage\(\{ type: "parse", bytes, password \}, \[bytes\]\)/u);
    expect(ui).not.toMatch(/JSON\.stringify\([^)]*password/u);
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

  // **Three tests stood here until 2026-08-18 and are gone with the engine they described**
  // (D-129): they held `lib/slip-ocr-engine.ts` to serving tesseract's worker, core and language
  // data from this origin rather than a CDN, to writing nothing into IndexedDB, and to naming
  // exactly the assets `scripts/copy-tesseract-assets.mjs` copied. The slip reader now calls
  // Google Cloud Vision through this app's own route, so there is no engine in the browser, no
  // self-hosted asset and no client-side cache for any of them to be about. What replaced them is
  // the test below and `sends every capture image to this app's own origin and nowhere else` —
  // the key stays on the server, the browser names no third party, and the CSP is unchanged.
  //
  // Deleting a test is not free and this says so rather than doing it quietly: what those three
  // proved that nothing now proves is that a *bundled* engine stayed off the network. There is no
  // bundled engine to hold to it.

  // **This test was reversed on 2026-08-18 and the reversal is the point of the entry** (D-129).
  // It used to assert that no machine-read digit could reach the slip's amount box, which was
  // D-087 — measured on tesseract, where digits came back unstable about one time in fifteen and
  // at least one wrong figure passed the strict money grammar. That engine is gone. Through Vision
  // the amount is located on 23 of 23 real slips and parses as money on all 23 (D-128), so what has
  // to be asserted instead is the same thing the card path asserts since D-115: a figure may reach
  // the box **only** through the strict grammar, never through a parser the form wrote for itself.
  it("offers the slip's amount only through the strict grammar, never through a parser of its own", () => {
    const form = readFileSync("app/slip-capture.tsx", "utf8");
    const reader = /async function readAmountOnImage\(\)[\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(reader, "readAmountOnImage must exist for this test to mean anything").toContain("proposeAmount(");

    // The single door. `proposeAmount` refuses anything that is not a printed money figure beside
    // the amount's own label, and it is what finally converts one — so a wrong-but-plausible figure
    // cannot be manufactured here. A second path (a regex over the words, a lenient parse, a "tidy
    // this up" helper written for the occasion) is exactly the silent error D-112 named as the
    // residual risk, and it would not look wrong at the call site.
    //
    // **Matched on the call, not the bare name**, so the comments in this function explaining which
    // grammar produced the figure do not fail the rule. That mistake has now been made three times
    // in this repository (GOTCHAS).
    expect(reader, "a figure may only be offered when the strict grammar said ok")
      .not.toMatch(/parseThb\(|\.replace\(|new RegExp\(/u);

    // `setAmount` is called once, with the strict grammar's own value put back into plain decimal
    // notation. `plainThb` is the inverse of the `parseThb` inside `proposeAmount`, so the box holds
    // a figure this form parses back to exactly the amount that was read.
    // `.+` rather than `[^)]*`: the argument is itself a call, so stopping at the first closing
    // parenthesis would capture half of it and the assertion would read as a mismatch.
    const fills = [...reader.matchAll(/setAmount\((.+)\);/gu)].map((match) => match[1]!);
    expect(fills, "the amount box is filled exactly once").toHaveLength(1);
    expect(fills[0]).toBe("plainThb(proposed.value)");

    // The crop survives the reversal and is now the owner's check on the offered figure rather than
    // the product itself, so it must still be shown — including when the figure refused to parse.
    expect(reader).toContain("locateAmount(");
    expect(reader).toContain("setAmountCrop(cropAmountRegion(bitmap, located.value))");
  });

  it("keeps no local OCR engine anywhere in the tree", () => {
    // D-120 removed the card path's engine and D-129 removed the slip path's, which was its last
    // caller. Re-adding one as a fallback would put **two engines behind one grammar** — the trap
    // D-119 names, where `findCards` depends on where an engine breaks a Thai run, and where every
    // future grammar change has to be measured twice while one side rots quietly.
    //
    // Matched on the package name and the deleted module's identifiers rather than on the bare word
    // "tesseract", so the comments in this file and in the forms explaining why the engine went away
    // do not fail the rule. That mistake has now been made twice in this file (GOTCHAS).
    expect(existsSync("lib/slip-ocr-engine.ts"), "the local engine is deleted, not disabled").toBe(false);
    expect(readFileSync("package.json", "utf8"), "no OCR engine is a dependency of this app")
      .not.toMatch(/"tesseract\.js"|"@tesseract\.js-data\//u);
    for (const file of ["app/slip-capture.tsx", "app/slip-batch.tsx", "app/notification-card-capture.tsx", "lib/slip-ocr.ts", "lib/slip-scan.ts", "lib/slip-batch.ts", "lib/browser/ocr-reader.ts", "lib/browser/qr-detector.ts"]) {
      expect(readFileSync(file, "utf8"), `${file} must not reach a local engine`)
        .not.toMatch(/readSlipWords|releaseSlipOcr|slip-ocr-engine|import\("tesseract/u);
    }
  });

  // **This test was reversed on 2026-08-16 and the reversal is the point of the entry.** It used
  // to assert that no card figure could be pre-filled, which was D-087. D-114 put that decision on
  // trial rather than overturning it, so a card's four digit-bearing fields are now offered values
  // — and what has to be asserted instead is that the offer goes through the one module that
  // cannot manufacture a figure, and that nothing but a field name leaves the form.
  it("offers a card's figures only through the strict pre-fill, never through a parser of its own", () => {
    const form = readFileSync("app/notification-card-capture.tsx", "utf8");

    // The single door. A second path — a regex over the OCR text, a lenient parse, a "clean this
    // up" helper written for the occasion — is exactly the silent error D-112 named as the residual
    // risk, and it would not look wrong at the call site.
    const offer = /function offerPrefill\([\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(offer, "offerPrefill must exist for this test to mean anything").toContain("prefillCardFields(");
    expect(offer, "a figure may only be offered when the strict module said ok").not.toMatch(/parseThb|replace\(|RegExp|\/\^/u);

    // `readImage` still fills nothing: it has not chosen a card yet, and a pre-fill belongs to one.
    const reader = /async function readImage\([\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(reader, "readImage must exist for this test to mean anything").toContain("findCards(");
    for (const setter of ["setAmount", "setBalance", "setPrintedDigits", "setOccurredAtTime"]) {
      expect(reader, `${setter} must not be reachable before a card is chosen`).not.toMatch(new RegExp(`${setter}\\(`, "u"));
    }

    // The direction **is** filled from the image as of D-123, and the rule that replaced "never"
    // is asserted in `keeps a card's two direction signals from collapsing into one`: it comes
    // from the printed sign, never from the direction word, and only when the two agree. What
    // still holds here is that it goes through the strict module like every other offer — no
    // second reading of the sign, no regex over the card's text.
    expect(offer, "the direction must come from the strict pre-fill's amount, not a reading of its own")
      .toMatch(/prefill\.amount\.value\.sign/u);
  });

  it("lets a pre-fill's audit trail carry field names and never a figure", () => {
    const form = readFileSync("app/notification-card-capture.tsx", "utf8");

    // D-114 records **structure, never values**: which fields were offered, and which of those the
    // owner changed. Both lists are built by filtering the field-name constant, so a figure cannot
    // travel in one by construction rather than by review.
    expect(form).toMatch(/offeredFieldNames\s*=\s*useMemo\(\s*\(\)\s*=>\s*PREFILL_FIELDS\.filter/u);
    expect(form).toMatch(/changedFieldNames\s*=\s*useMemo\(\s*\(\)\s*=>\s*PREFILL_FIELDS\.filter/u);

    // The remembered values exist to be compared and must not reach the request body. Asserted
    // against the submit call rather than the whole file, since comparing is legitimate elsewhere.
    const submit = /async function submit\([\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(submit, "submit must exist for this test to mean anything").toContain("/api/v1/notification-cards");
    expect(submit, "the remembered offer is a map of values and is for comparison, not for sending")
      .not.toMatch(/\boffered\b/u);
    // And the derived name lists are what does travel, so this test fails if the wiring is dropped
    // rather than passing vacuously once nothing is sent at all (migration 019).
    expect(submit).toMatch(/prefillOffered:\s*namesOrAbsent\(offeredFieldNames\)/u);
    expect(submit).toMatch(/prefillChanged:\s*namesOrAbsent\(changedFieldNames\)/u);
    // **An empty list must travel as an absent key, not as `[]`** (D-122). Migration 019 refuses
    // an explicitly empty array — `array_length` of an empty array is NULL, so its duplicate check
    // fires — and a card whose pre-fill the owner changed nothing on sends exactly that. Asserted
    // here because the failure is invisible until a real card is captured with a perfect pre-fill.
    expect(form).toMatch(/function namesOrAbsent\([\s\S]*?names\.length > 0 \? \[\.\.\.names\] : undefined/u);
  });

  it("sends the page and the keyboard to a capture's result, without trapping either", () => {
    const form = readFileSync("app/notification-card-capture.tsx", "utf8");
    const scroll = /function scrollToResult\(\)[\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(scroll, "scrollToResult must exist for this test to mean anything").toContain("scrollIntoView");

    // **No `behavior`, deliberately** (D-124). Unspecified, the browser follows the CSS
    // `scroll-behavior`, which `app/globals.css` sets to smooth and overrides to auto under
    // `prefers-reduced-motion`. Naming "smooth" here would ignore that preference, and it would
    // read as the more careful choice while being the less careful one.
    expect(scroll, 'passing behavior: "smooth" overrides prefers-reduced-motion')
      .not.toMatch(/behavior:\s*"smooth"/u);

    // Focus follows the eye (D-125), so Tab does not continue from a button that has scrolled off
    // the bottom. `preventScroll` because the scroll above already chose the position.
    expect(scroll).toMatch(/\.focus\(\{ preventScroll: true \}\)/u);
    // Reachable only programmatically: a result region in the Tab order is a stop on the way to
    // nothing, on every pass through the form.
    expect(form).toMatch(/role="status" tabIndex=\{-1\} data-capture-result/u);
    expect(form).toMatch(/role="alert" tabIndex=\{-1\} data-capture-result/u);
    // And it is a region, not a dialog: the moment the attribute is set, everything D-123 refused
    // — the focus trap, the Escape key, the restore on close — becomes owed and is not written.
    // Matched on the attribute rather than the word, so the comment above explaining the rule does
    // not fail the rule. That mistake has now been made twice in this file.
    expect(form, "a banner that grows aria-modal has become the dialog this deliberately is not")
      .not.toMatch(/aria-modal=/u);
  });

  it("keeps a card's two direction signals from collapsing into one", () => {
    const form = readFileSync("app/notification-card-capture.tsx", "utf8");

    // D-099 stores a card only when the words the card printed and the sign the owner chose
    // agree. Two ways of writing the gate look identical and are not: `!== "contradicted"` also
    // passes when there is no reading at all, so the cross-check retires itself the moment no
    // card region is in hand and the form stays submittable on one signal.
    expect(form, "the readiness gate must require agreement, not merely the absence of a contradiction")
      .toMatch(/directionAgrees/u);
    expect(form).toMatch(/directionCheck\?\.outcome === "read"/u);
    expect(form, 'a bare `!== "contradicted"` gate is the shape this test exists to prevent')
      .not.toMatch(/directionCheck\?\.outcome !== "contradicted"/u);

    // **The direction is filled from the printed sign and never from the direction word** (D-123),
    // and this is the assertion that keeps the cross-check from becoming a formality. The word is
    // what `readDirection` already holds; handing it back through the control would make the check
    // agree with itself on every card forever, and it would still *look* like a check. Filling
    // from the sign keeps two different printed features in play.
    const offer = /function offerPrefill\([\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(offer, "offerPrefill must exist for this test to mean anything").toContain("prefillCardFields");
    expect(offer, "the direction must come from the printed sign")
      .toMatch(/prefill\.amount\.value\.sign/u);
    expect(offer, "and it must be withheld unless the sign agrees with the direction word")
      .toMatch(/setDirection\(bySign !== "" && bySign === picked\.direction \? bySign : ""\)/u);
    // `picked.direction` is the word-derived signal. Assigning it to the control is the exact
    // collapse this test exists to prevent, however it is spelled.
    expect(offer, "the word-derived direction must never be assigned to the control")
      .not.toMatch(/setDirection\(picked\.direction\)/u);

    // `readImage` still fills nothing: it has not chosen a card yet, so any direction it set would
    // belong to no card in particular.
    const reader = /async function readImage\([\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(reader).not.toMatch(/setDirection\(/u);
  });

  it("sends every capture image to this app's own origin and nowhere else", () => {
    const client = readFileSync("lib/browser/ocr-reader.ts", "utf8");
    const bench = readFileSync("app/slips-bench.tsx", "utf8");
    // D-120 adopted Cloud Vision for the card path and D-129 for the slip path, and the whole
    // reason there is a route in front of it is that the browser must not hold the key or name the
    // third party. An absolute URL here would put both back — the key in a `NEXT_PUBLIC_` value the
    // page hands to anyone who loads it, and `vision.googleapis.com` in `connect-src`. The CSP
    // would refuse it today, and the policy is the backstop rather than the reason (D-058).
    expect(bench).toContain("NotificationCardCapture");
    expect(bench).toContain("SlipCapture");
    expect(client, "no absolute URL belongs in the browser's reader client").not.toMatch(/https?:\/\//u);
    expect(client).toMatch(/fetch\(OCR_READ_PATH/u);
    expect(client).toMatch(/OCR_READ_PATH = "\/api\/v1\/ocr\/read"/u);

    // **The path names no record type, and that is deliberate** (D-129). A slip reading through a
    // card's URL is the kind of misdescription that later gets reasoned from.
    //
    // Asserted against the **constant's own declaration** rather than the whole file, because the
    // file explains in prose what the path used to be — and a rule that fails on its own reason is
    // a rule someone deletes the reason to satisfy (GOTCHAS).
    const declared = /OCR_READ_PATH = "([^"]+)"/u.exec(client)?.[1] ?? "";
    expect(declared, "the reader path must not name one record type now that two forms use it")
      .not.toMatch(/notification-cards|slips|cards/u);

    // Every form that reads an image goes through that one client rather than writing its own
    // `fetch`, so there is one place the URL, the encoding and the key rule are stated.
    //
    // **Found rather than listed**, for the reason the walk at the top of this file exists. This
    // named two files until bulk slip upload added a third (`app/slip-batch.tsx`), and a list that
    // has to be maintained by hand to stay true is the drift this suite has now been bitten by
    // three times. Anything under `app/` that reaches the reader is covered the moment it is
    // written.
    const readers = appSources().filter((file) => readFileSync(file, "utf8").includes("readImageWords("));
    expect(readers.length, "no reader forms found — the walk is looking in the wrong place").toBeGreaterThan(1);
    for (const file of readers) {
      const form = readFileSync(file, "utf8");
      expect(form, `${file}: no absolute URL belongs in a capture form`).not.toMatch(/https?:\/\//u);
      expect(form, `${file}: the API key belongs to the route and must never be read in the browser`)
        .not.toMatch(/GOOGLE_VISION_KEY|X-Goog-Api-Key/u);
      // The complement of how the list was built: a form may reach the reader **only** through the
      // shared client, so a `fetch` of its own to the reader path — the way to have the pixels
      // without the module's rules — fails here rather than passing by not being on a list.
      expect(form, `${file}: the reader is reached through the shared client, never a fetch of its own`)
        .not.toMatch(/fetch\(\s*(?:OCR_READ_PATH|"\/api\/v1\/ocr)/u);
    }
  });

  // **Bulk upload files slips the owner has not looked at, so its two doors are worth their own
  // test** (PLAN task 39, D-135). A figure may reach a row only through the strict grammar, as the
  // single-slip form is held above — and a date may reach one only from the QR's CRC-covered
  // reference or from the printed line, never from today. The second half has no counterpart in the
  // single form, where today is a correct default; in a batch it is the failure that cannot heal,
  // because a slip dated today that happened last month can never pair inside the one-day window.
  it("fills a batch row from the strict grammar and never dates one today", () => {
    const form = readFileSync("app/slip-batch.tsx", "utf8");
    const policy = readFileSync("lib/slip-batch.ts", "utf8");

    // The single door for the amount. The component never runs a grammar of its own: it fills a row
    // from `classifySlip`'s value and reads a typed one back through `parseThb`, the same exact-money
    // reader every other path uses.
    expect(policy, "the amount must come through the strict grammar").toContain("proposeAmount(");
    expect(form, "the component must not read the amount for itself").not.toMatch(/proposeAmount\(|locateAmount\(/u);

    // **Every** `plainThb` call in the component, not the one that happens to end a line. The first
    // version of this assertion anchored on a trailing newline and a second fill written one line
    // later slipped straight past it — the trap `GOTCHAS.md` records as a source-grep test passing
    // over code that has moved out from under it, hit again while writing the test meant to prevent
    // it. The set is what matters: one call, and its argument is the strict grammar's own value.
    const fills = [...form.matchAll(/plainThb\(([^)]*)\)/gu)].map((match) => match[1]!);
    expect(fills, "a row's amount is filled exactly once, from the strict grammar's own value")
      .toEqual(["verdict.amountMinor"]);

    // And the function that fills it holds no grammar of its own — no lenient parse, no regex over
    // the words, no "tidy this up" helper written for the occasion. The same scoped rule the
    // single-slip form's `readAmountOnImage` is held to above.
    const reader = /async function readOne\([\s\S]*?\n  \}/u.exec(form)?.[0] ?? "";
    expect(reader, "readOne must exist for this test to mean anything").toContain("classifySlip(");
    expect(reader, "a figure may only be offered when the strict grammar said ok")
      .not.toMatch(/parseThb\(|\.replace\(|new RegExp\(/u);

    // Never today, in either half. `toISOString().slice(0, 10)` is the UTC form D-110 fixed twice
    // and is wrong here for a second, larger reason — a backlog is not today whatever the clock says.
    for (const [name, source] of [["app/slip-batch.tsx", form], ["lib/slip-batch.ts", policy]] as const) {
      expect(source, `${name} must not date a slip from the clock`).not.toMatch(/toISOString\(\)|bangkokToday\(/u);
    }
    // And the two exact sources it may use instead, both named in the policy rather than the form.
    expect(policy).toContain("slipDateFromReference(");
    expect(policy).toContain("readPrintedDate(");
  });

  it("keeps the Vision key out of every file except the one route that uses it", () => {
    const engine = readFileSync("lib/vision-ocr.ts", "utf8");
    const route = readFileSync("app/api/v1/ocr/read/route.ts", "utf8");

    // The key is a parameter here, never an environment read, so this module is drivable by a test
    // and by the measurement harness without either holding a credential — and nothing in it can
    // log a value it does not have.
    expect(engine, "the engine module must not read the key from the environment")
      .not.toMatch(/process\.env/u);
    expect(engine).toMatch(/apiKey: string/u);
    // Neither the image nor the recognised words may reach a log. The route relays a screenshot to
    // a third party, so its own logs are the one place that disclosure could quietly double.
    for (const [name, source] of [["engine", engine], ["route", route]] as const) {
      expect(source, `${name} must not log`).not.toMatch(/console\.(log|error|warn|info|debug)/u);
    }
    // Vision's own message can quote the image it read, so a refusal is mapped to this app's
    // words rather than echoed.
    expect(route).not.toMatch(/error\.message|\.error\?\.message/u);
    // Read at the point of use, so a deployment adding the key needs no rebuild and a missing one
    // is a refusal the owner can act on rather than a build failure somewhere unrelated.
    expect(route).toMatch(/process\.env\.GOOGLE_VISION_KEY/u);
  });

  it("keeps the session in cookies, which is the only client storage this app has", () => {
    const browser = readFileSync("lib/browser/supabase.ts", "utf8");
    const access = readFileSync("app/owner-access.tsx", "utf8");
    // `createBrowserClient` from `@supabase/ssr` is the cookie-backed client; plain
    // `createClient` from `supabase-js` defaults to localStorage, which would put the
    // session somewhere `strongOwnerClient` cannot read *and* somewhere this app has
    // promised to keep nothing. The two failures look nothing alike — the first is a
    // signed-in browser whose every request is 401 — so the import is asserted rather
    // than left to a convention.
    expect(browser).toContain('createBrowserClient } from "@supabase/ssr"');
    expect(browser).not.toMatch(/from\s+"@supabase\/supabase-js"/u);

    // Comments are stripped before the storage check, the same way string literals are
    // stripped for the worker's postMessage check above. Both of these files *explain* why
    // they store nothing, so the words appear in prose — and a grep over raw source failed
    // on its own documentation the first time this was run. The rule is about code.
    const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
    for (const [name, source] of [["lib/browser/supabase.ts", browser], ["app/owner-access.tsx", access]] as const) {
      expect(codeOnly(source), `${name} must not store anything on the device`)
        .not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/u);
      expect(codeOnly(source), `${name} must not log`).not.toMatch(/console\./u);
    }
    // The enrolment secret is shown to the owner and typed into an authenticator. It must
    // never be sent anywhere: no fetch, and no request built around it.
    expect(codeOnly(access)).not.toMatch(/fetch\(/u);
  });

  it("never redirects a Google sign-in to an address the request supplied", () => {
    const callback = readFileSync("app/auth/callback/route.ts", "utf8");
    // This URL is handed to a third party by construction, so anything it echoes from its
    // own query string into a Location header is attacker-controlled. The landing page is
    // a module constant and the only value that may reach the header.
    expect(callback).toMatch(/const LANDING = "\/ledger";/u);
    const location = /Location:\s*([^\n]*)/u.exec(callback)?.[1] ?? "";
    expect(location).toContain("LANDING");
    expect(callback).not.toMatch(/searchParams\.get\("(next|redirect|redirectTo|return|returnTo)"\)/u);
    // Only these three parameters are read, and none of them is a destination.
    const read = [...callback.matchAll(/searchParams\.get\("([^"]+)"\)/gu)].map((match) => match[1]!);
    expect(new Set(read)).toEqual(new Set(["error", "error_description", "code"]));
  });

  it("keeps masked dumps out of git", () => {
    const ignored = readFileSync(".gitignore", "utf8");
    // A dump is value-free but describes a real document, so committing one would make
    // every fixture written afterwards non-invented (docs/FIXTURE_POLICY.md).
    expect(ignored).toMatch(/^masked-dumps\/$/mu);
    expect(ignored).toMatch(/^private-statements\/$/mu);
    // `public/tesseract/` was asserted here until 2026-08-18 and went with the local engine
    // (D-129). The ZXing reader is the one binary the build still copies, and it is held to the
    // same rule: in git it would be a review surface nobody can read, drifting from the package
    // version it must match.
    expect(ignored).toMatch(/^public\/zxing_reader\.wasm$/mu);
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

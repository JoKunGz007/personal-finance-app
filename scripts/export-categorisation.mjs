#!/usr/bin/env node
// Read-only export of the hosted ledger for the local-llm categorisation experiment
// (PLAN task 25 / D-090, D-245). Writes two CSVs into local-llm's gitignored data folder;
// nothing here writes to any database.
//
// Usage (project-local Node 24 — see docs/LOCAL_DEV.md; repo must be `supabase link`ed):
//   node scripts/export-categorisation.mjs [outDir]
//
// Excluded on purpose: accounts.last_four, post_balance_minor, reference. Digit runs of 4+
// in descriptions are masked, because descriptions can carry account-number fragments.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "D:\\Projects\\local-llm\\data\\transactions";
const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

// Single-line SQL with --linked first: the CLI can otherwise answer from a local database
// without saying so (GOTCHAS: `supabase db query --linked`).
function query(sql) {
  if (sql.includes('"') || sql.includes("\n")) throw new Error("SQL must be one line without double quotes");
  const out = execSync(`pnpm exec supabase db query --linked "${sql}" -o json`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  // A bare `[...]` in a plain terminal; `{ boundary, rows, warning }` when the CLI detects an agent.
  const start = [out.indexOf("["), out.indexOf("{")].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const parsed = JSON.parse(out.slice(start));
  return Array.isArray(parsed) ? parsed : parsed.rows;
}

const [{ addr }] = query("select inet_server_addr()::text as addr");
if (!addr || /^(127\.|::1|10\.|172\.|192\.168\.)/.test(addr)) {
  throw new Error(`Refusing: query answered from a non-hosted address (${addr})`);
}

const txns = query(
  "select t.id as txn_id, t.source_date::text as date, sum(c.amount_minor)::bigint as signed_minor, coalesce(o.description, t.description) as bank_description, t.transaction_label as txn_label, o.counterparty, a.label as account_label, o.category_id, cat.name as category_name, par.name as parent_name, pv.source as prov_source, coalesce(pv.detail->>'rule', pv.detail->>'kind') as category_rule, (rv.transaction_id is not null) as category_reviewed, coalesce(o.include_in_reporting, true) as include_in_reporting from source_transactions t join source_components c on c.transaction_id = t.id join accounts a on a.id = t.account_id left join transaction_overlays o on o.transaction_id = t.id left join categories cat on cat.id = o.category_id left join category_parents cp on cp.category_id = cat.id left join categories par on par.id = cp.parent_id left join lateral (select p.source, p.detail, p.overlay_revision from category_provenance p where p.transaction_id = t.id order by p.overlay_revision desc limit 1) pv on true left join category_reviews rv on rv.transaction_id = t.id and rv.overlay_revision = pv.overlay_revision group by t.id, o.transaction_id, a.id, cat.id, par.id, pv.source, pv.detail, rv.transaction_id order by t.source_date, t.source_time nulls first, t.id"
);
const cats = query(
  "select c.id as category_id, c.name, cp.parent_id, count(o.transaction_id) as txn_count from categories c left join category_parents cp on cp.category_id = c.id left join transaction_overlays o on o.category_id = c.id where not c.archived group by c.id, cp.parent_id order by c.name"
);

const mask = (s) => (s ?? "").replace(/\d{4,}/g, "****");
function money(minor) {
  const n = BigInt(minor);
  const abs = n < 0n ? -n : n;
  return `${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, rows) => "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

const txnRows = txns.map((t) => [
  t.txn_id,
  t.date,
  BigInt(t.signed_minor) < 0n ? "out" : "in",
  money(t.signed_minor),
  mask(t.bank_description),
  t.txn_label,
  mask(t.counterparty),
  t.account_label,
  t.category_id,
  t.parent_name ? `${t.parent_name} › ${t.category_name}` : t.category_name,
  t.category_id ? (t.prov_source ?? "owner") : "none", // a category with no provenance row predates D-245: the owner's
  t.category_rule,
  t.category_reviewed,
  t.include_in_reporting
]);

mkdirSync(outDir, { recursive: true });
const txnPath = join(outDir, `transactions_${day}.csv`);
const catPath = join(outDir, `categories_${day}.csv`);
writeFileSync(
  txnPath,
  csv(
    ["txn_id", "date", "direction", "amount", "bank_description", "txn_label", "counterparty", "account_label", "category_id", "category_name", "category_source", "category_rule", "category_reviewed", "include_in_reporting"],
    txnRows
  )
);
writeFileSync(catPath, csv(["category_id", "name", "parent_id", "txn_count"], cats.map((c) => [c.category_id, c.name, c.parent_id, c.txn_count])));

console.log(`${txnPath}: ${txnRows.length} rows, ${txnRows.filter((r) => r[8]).length} categorised`);
console.log(`${catPath}: ${cats.length} categories`);

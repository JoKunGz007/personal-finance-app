import { z } from "zod";
import type { strongOwnerClient } from "@/lib/server/supabase";
import { CATEGORY_RULES, firstMatchingRule, type CategoryRule } from "@/lib/category-rules";
import { loadCurrentMatches, type CurrentMatch } from "@/lib/server/current-matches";

/**
 * The auto-categoriser (D-245 step 3). `decideCategories` is pure: from every transaction, the
 * categories and the current matches it proposes machine categories. `autoCategorise` reads the
 * inputs, decides, and writes through `apply_category_proposals`, which re-checks every protection.
 *
 * Precedence: an automatically excluded own transfer → Own Transfers; a match (ride, delivery, receipt); the owner's
 * history for the same description; the first keyword rule; otherwise nothing.
 */
type OwnerClient = Extract<Awaited<ReturnType<typeof strongOwnerClient>>, { ok: true }>["supabase"];

export const categoryInputSchema = z.object({
  id: z.string().uuid(),
  amount_minor: z.string().regex(/^-?\d+$/),
  description: z.string(),
  transaction_label: z.string(),
  include_in_reporting: z.boolean(),
  category_id: z.string().uuid().nullable(),
  source: z.enum(["owner", "rule", "match", "model"]).nullable(),
  reviewed: z.boolean()
}).strict();

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryNodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  archived: z.boolean(),
  parent_id: z.string().uuid().nullable()
}).strict();

export type CategoryNode = z.infer<typeof categoryNodeSchema>;

export const categoryInputsSchema = z.object({
  transactions: z.array(categoryInputSchema),
  categories: z.array(categoryNodeSchema)
}).strict();

export interface CategoryProposal {
  transaction_id: string;
  category_id: string;
  source: "rule" | "match";
  detail: Record<string, string>;
}

export interface CategoryDecision {
  proposals: CategoryProposal[];
  /** Rows whose chosen category's parent does not exist (or is archived). */
  unresolved: number;
}

const MATCH_CATEGORY: Record<CurrentMatch["kind"], string> = {
  ride: "Transport › Ride-hailing",
  delivery: "Food & Drinks › Delivery",
  receipt: "Groceries & Convenience › Convenience Store"
};

/** Digits removed, whitespace collapsed, lower-cased: one merchant's rows share a key. */
export function normaliseDescription(description: string): string {
  return description.replace(/\d/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Thai or Latin letters, digits and punctuation not counted. */
const letterCount = (text: string) => (text.match(/[A-Za-zก-๎]/g) ?? []).length;

/** A history key needs this many letters, so a generic line ("TR fr") never keys a match. */
export const HISTORY_MIN_LETTERS = 8;

const signOf = (row: CategoryInput) => {
  const amount = BigInt(row.amount_minor);
  return amount > 0n ? 1 : amount < 0n ? -1 : 0;
};

/** The history key: the direction plus the normalised description; null when too generic to key. */
function historyKey(row: CategoryInput): string | null {
  const key = normaliseDescription(row.description);
  return letterCount(key) < HISTORY_MIN_LETTERS ? null : `${signOf(row)}:${key}`;
}

/** The owner chose this category, or confirmed a machine one. A legacy category reads as the owner's. */
const ownerSettled = (row: CategoryInput) => row.category_id !== null && (row.source === "owner" || row.source === null || row.reviewed);

/** The database would refuse to overwrite these (migration 048); proposing for them is noise. */
const protectedRow = (row: CategoryInput) =>
  row.source === "owner" || row.reviewed || (row.category_id !== null && row.source === null);

/** `"Parent"` or `"Parent › Child"` to an id: a missing child falls back to the parent; a missing parent is null. */
function categoryResolver(categories: readonly CategoryNode[]) {
  const live = categories.filter((category) => !category.archived);
  const key = (name: string) => name.trim().toLowerCase();
  return (path: string): string | null => {
    const [parentName, childName] = path.split("›").map((part) => part.trim());
    const parent = live.find((category) => category.parent_id === null && key(category.name) === key(parentName!));
    if (!parent) return null;
    if (childName === undefined) return parent.id;
    const child = live.find((category) => category.parent_id === parent.id && key(category.name) === key(childName));
    return child?.id ?? parent.id;
  };
}

export function decideCategories(
  rows: readonly CategoryInput[],
  categories: readonly CategoryNode[],
  matches: readonly CurrentMatch[],
  /** Rows `auto_exclude_internal_transfers` excluded (`list_auto_excluded_transactions`); a hand exclusion is not one. */
  autoExcluded: ReadonlySet<string>,
  rules: readonly CategoryRule[] = CATEGORY_RULES
): CategoryDecision {
  const resolve = categoryResolver(categories);
  // The first match a row holds wins; `loadCurrentMatches` lists rides, then orders, then receipts.
  const matchOf = new Map<string, CurrentMatch>();
  for (const match of matches) if (!matchOf.has(match.transaction_id)) matchOf.set(match.transaction_id, match);
  // History: a description, in one direction, whose settled rows all agree on one category.
  // Disagreement is no answer.
  const history = new Map<string, string | null>();
  for (const row of rows) {
    if (!ownerSettled(row)) continue;
    const key = historyKey(row);
    if (key === null) continue;
    const seen = history.get(key);
    history.set(key, seen === undefined || seen === row.category_id ? row.category_id : null);
  }

  const proposals: CategoryProposal[] = [];
  let unresolved = 0;
  for (const row of rows) {
    if (protectedRow(row)) continue;
    let choice: { category_id: string | null; source: "rule" | "match"; detail: Record<string, string> } | null = null;
    const match = matchOf.get(row.id);
    const key = historyKey(row);
    const remembered = key === null ? undefined : history.get(key);
    if (autoExcluded.has(row.id)) {
      choice = { category_id: resolve("Own Transfers"), source: "match", detail: { rule: "own-transfer" } };
    } else if (match) {
      choice = { category_id: resolve(MATCH_CATEGORY[match.kind]), source: "match", detail: { kind: match.kind, entity_id: match.entity_id } };
    } else if (remembered) {
      choice = { category_id: remembered, source: "rule", detail: { rule: "history" } };
    } else {
      const rule = firstMatchingRule(`${row.description} ${row.transaction_label}`, signOf(row), rules);
      if (rule) choice = { category_id: resolve(rule.category), source: "rule", detail: { rule: rule.id } };
    }
    if (!choice) continue;
    if (choice.category_id === null) { unresolved += 1; continue; }
    if (choice.category_id === row.category_id) continue;
    proposals.push({ transaction_id: row.id, category_id: choice.category_id, source: choice.source, detail: choice.detail });
  }
  return { proposals, unresolved };
}

/** Sequential calls of this many items, each committing on its own (the RPC's own cap is 5000). */
export const PROPOSAL_CHUNK = 300;

export type AutoCategoriseResult = {
  applied: number;
  skipped: number;
  unresolved: number;
  /** Proposals sent, by source; `applied` + `skipped` is their total. */
  bySource: { match: number; rule: number };
};

const applyResultSchema = z.object({ applied: z.number().int(), skipped: z.number().int() }).strict();

/** On a failed chunk the run stops; `result` then holds what the earlier chunks already committed. */
export async function autoCategorise(supabase: OwnerClient): Promise<
  { ok: true; result: AutoCategoriseResult } | { ok: false; message: string; result?: AutoCategoriseResult }
> {
  const [inputs, excluded, matches] = await Promise.all([
    supabase.rpc("list_category_inputs"), supabase.rpc("list_auto_excluded_transactions"), loadCurrentMatches(supabase)
  ]);
  const parsed = categoryInputsSchema.safeParse(inputs.data);
  const parsedExcluded = z.array(z.string().uuid()).safeParse(excluded.data);
  if (inputs.error || !parsed.success || excluded.error || !parsedExcluded.success) return { ok: false, message: "Categories could not be checked." };
  // A match read that failed is a refusal, never "no match": it would hand matched rows to the rules.
  if (!matches.ok) return { ok: false, message: "Categories could not be checked." };
  const decision = decideCategories(parsed.data.transactions, parsed.data.categories, matches.matches, new Set(parsedExcluded.data));
  const result: AutoCategoriseResult = {
    applied: 0, skipped: 0, unresolved: decision.unresolved,
    bySource: {
      match: decision.proposals.filter((proposal) => proposal.source === "match").length,
      rule: decision.proposals.filter((proposal) => proposal.source === "rule").length
    }
  };
  for (let start = 0; start < decision.proposals.length; start += PROPOSAL_CHUNK) {
    const { data, error } = await supabase.rpc("apply_category_proposals", { p_items: decision.proposals.slice(start, start + PROPOSAL_CHUNK) });
    const applied = applyResultSchema.safeParse(data);
    if (error || !applied.success) return { ok: false, message: "Categories could not be applied.", result };
    result.applied += applied.data.applied;
    result.skipped += applied.data.skipped;
  }
  return { ok: true, result };
}

import { z } from "zod";

/**
 * The automatic half of matching an itemizing document — a 7-Eleven receipt (D-212) or a
 * delivery order (D-220) — to the ledger row that paid for it. Each caller supplies its own
 * candidate rows and its own rule for one candidate; what they share is everything after that:
 *
 * - the owner's stored decision always wins, and a row a decision holds is off the table for
 *   every other document;
 * - the pair is **mutually unique**: the document has exactly one qualifying row, and that row is
 *   the qualifying candidate of no other undecided document. Two candidates is a refusal, never a
 *   choice (D-063).
 *
 * Order-independent: nothing here depends on the order documents or candidates arrive in, which
 * is what mutual uniqueness buys over greedy pairing.
 */

/** The owner's link or decline, as either match route accepts it: a link names a row, a decline none. */
export const ledgerMatchRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["matched", "unmatched"]),
  transactionId: z.string().uuid().nullable()
}).strict().superRefine((match, context) => {
  if ((match.decision === "matched") !== (match.transactionId !== null)) {
    context.addIssue({ code: "custom", message: "A link names a ledger row and a decline names none.", path: ["transactionId"] });
  }
});

export type LedgerMatchRequest = z.infer<typeof ledgerMatchRequestSchema>;

export type LedgerMatchStatus = "linked" | "declined" | "matched" | "ambiguous" | "none";

export interface LedgerMatchDecision {
  documentId: string;
  decision: "matched" | "unmatched";
  transaction_id: string | null;
  revision: number;
}

export interface LedgerMatchState<Row> {
  status: LedgerMatchStatus;
  row: Row | null;
  options: Row[];
  revision: number;
}

export function proposeLedgerMatches<Candidate extends { transaction_id: string }, Row>(
  documentIds: readonly string[],
  candidates: readonly Candidate[],
  decisions: readonly LedgerMatchDecision[],
  rule: {
    documentOf: (candidate: Candidate) => string;
    qualifies: (candidate: Candidate) => boolean;
    toRow: (candidate: Candidate) => Row;
  }
): Map<string, LedgerMatchState<Row>> {
  const decisionOf = new Map(decisions.map((decision) => [decision.documentId, decision]));
  // Rows an owner decision holds, and by which document: off the table for everyone else.
  const claimedBy = new Map<string, string>();
  for (const decision of decisions) {
    if (decision.decision === "matched" && decision.transaction_id) claimedBy.set(decision.transaction_id, decision.documentId);
  }

  const candidatesOf = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const id = rule.documentOf(candidate);
    const list = candidatesOf.get(id) ?? [];
    list.push(candidate);
    candidatesOf.set(id, list);
  }

  const automaticOf = new Map<string, Candidate[]>();
  const wantedBy = new Map<string, number>();
  for (const documentId of documentIds) {
    if (decisionOf.has(documentId)) continue;
    const automatic = (candidatesOf.get(documentId) ?? [])
      .filter((candidate) => rule.qualifies(candidate) && !claimedBy.has(candidate.transaction_id));
    automaticOf.set(documentId, automatic);
    for (const candidate of automatic) wantedBy.set(candidate.transaction_id, (wantedBy.get(candidate.transaction_id) ?? 0) + 1);
  }

  const states = new Map<string, LedgerMatchState<Row>>();
  for (const documentId of documentIds) {
    const own = candidatesOf.get(documentId) ?? [];
    const options = own
      .filter((candidate) => { const holder = claimedBy.get(candidate.transaction_id); return holder === undefined || holder === documentId; })
      .map(rule.toRow);
    const decision = decisionOf.get(documentId);
    if (decision) {
      const linked = decision.transaction_id === null ? undefined : own.find((candidate) => candidate.transaction_id === decision.transaction_id);
      states.set(documentId, {
        status: decision.decision === "matched" ? "linked" : "declined",
        row: linked ? rule.toRow(linked) : null,
        options,
        revision: decision.revision
      });
      continue;
    }
    const automatic = automaticOf.get(documentId) ?? [];
    const only = automatic.length === 1 ? automatic[0]! : null;
    if (only && wantedBy.get(only.transaction_id) === 1) {
      states.set(documentId, { status: "matched", row: rule.toRow(only), options, revision: 0 });
    } else {
      states.set(documentId, { status: automatic.length === 0 ? "none" : "ambiguous", row: null, options, revision: 0 });
    }
  }
  return states;
}

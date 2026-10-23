"use client";

import { useState } from "react";
import { formatThb, type MinorUnitString } from "@/lib/money";
import {
  groupSpendingByParent,
  shareOf,
  type ExactShare,
  type SpendingByCategory
} from "@/lib/statistics";

/** Presentation only, through the page's one share helper (D-160); nothing is derived from it. */
function percentOf(share: ExactShare): number {
  return shareOf(share.numerator as MinorUnitString, share.denominator as MinorUnitString) ?? 0;
}

function money(minor: string): string {
  return formatThb(minor as MinorUnitString);
}

/** An inline SVG with a percentage `width` attribute: no `style` attribute, so the CSP is untouched. */
function ShareBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <svg className="category-bar" width="100%" height="8" aria-hidden="true" focusable="false">
      <rect className="category-bar-track" x="0" y="0" width="100%" height="8" />
      <rect className="category-bar-fill" x="0" y="0" width={`${clamped}%`} height="8" />
    </svg>
  );
}

function Figures(
  { spendingMinor, share, transactionCount }: { spendingMinor: string; share: ExactShare; transactionCount: number }
) {
  const percent = percentOf(share);
  return (
    <>
      <span className="category-amount numeric">{money(spendingMinor)}</span>
      <span className="category-meta field-help">
        {percent.toFixed(1)}% · {transactionCount} {transactionCount === 1 ? "row" : "rows"}
      </span>
      <ShareBar percent={percent} />
    </>
  );
}

function Label({ label, archived }: { label: string; archived: boolean }) {
  return (
    <span className="category-label">
      {label}
      {archived ? <> <span className="status-chip excluded">archived</span></> : null}
    </span>
  );
}

export function SpendingByCategoryList({ data }: { data: SpendingByCategory }) {
  const groups = groupSpendingByParent(data);
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  if (groups.length === 0) return <p className="field-help">No spending in this window.</p>;
  const toggle = (key: string) => setOpenKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return (
    <ul className="category-list">
      {groups.map((group) => {
        const open = openKeys.has(group.key);
        const childrenId = `category-children-${group.key}`;
        return (
          <li key={group.key} className="category-group">
            {group.children.length > 0
              ? (
                <button type="button" className="category-row category-toggle" aria-expanded={open}
                  aria-controls={childrenId} onClick={() => toggle(group.key)}>
                  <Label label={group.label} archived={group.archived} />
                  <Figures spendingMinor={group.spendingMinor} share={group.share}
                    transactionCount={group.transactionCount} />
                </button>
              )
              : (
                <div className="category-row">
                  <Label label={group.label} archived={group.archived} />
                  <Figures spendingMinor={group.spendingMinor} share={group.share}
                    transactionCount={group.transactionCount} />
                </div>
              )}
            {group.children.length > 0 ? (
              <ul id={childrenId} className="category-children" hidden={!open}>
                {group.children.map((child) => (
                  <li key={child.key} className="category-row category-child">
                    <Label label={child.label} archived={child.archived} />
                    <Figures spendingMinor={child.spendingMinor} share={child.share}
                      transactionCount={child.transactionCount} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

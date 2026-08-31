"use client";

import { type LedgerAccount } from "@/lib/accounts";
import { ALL_ACCOUNTS } from "@/app/ledger-shared";

/**
 * The account picker `/ledger` and `/statistics` both need, extracted rather than kept as two
 * copies of the same options list — a fix to how an account is labelled or ordered otherwise
 * lands on one page and not the other with nothing to say so.
 *
 * `value`/`onChange` carry the raw select value, `ALL_ACCOUNTS` included, matching the ledger's
 * existing contract rather than introducing a second `string | null` convention beside it — a
 * caller that wants `null` for "all" translates at its own boundary.
 *
 * `showUnknown` is opt-in and off by default, so the ledger's behaviour is unchanged by this
 * extraction. When on, an id that names no loaded account — because the list is still loading, or
 * because the URL named one the owner does not hold — gets its own option rather than being
 * silently swallowed into "All accounts": a `<select>` with no matching `<option>` falls back to
 * whichever option is first, which would show "All accounts" as selected while the page it sits on
 * is genuinely narrowed to that id.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  disabled,
  label = "Account",
  showUnknown = false,
  className
}: {
  accounts: readonly LedgerAccount[] | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  showUnknown?: boolean;
  className?: string;
}) {
  const known = accounts ?? [];
  const matches = value === ALL_ACCOUNTS || known.some((account) => account.id === value);
  return (
    <label className={className ? `account-control ${className}` : "account-control"}>
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value={ALL_ACCOUNTS}>All accounts</option>
        {known.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label} ···· {account.last_four}
          </option>
        ))}
        {showUnknown && !matches && (
          <option value={value}>{accounts === null ? "Loading account…" : "Unknown account"}</option>
        )}
      </select>
    </label>
  );
}

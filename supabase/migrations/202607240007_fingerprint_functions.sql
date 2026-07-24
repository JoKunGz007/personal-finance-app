-- Server-side building blocks for binding row fingerprints (review blocker 1
-- follow-up). Fingerprints are still caller-supplied; these functions let
-- confirm_import recompute them from the persisted facts so a claimed fingerprint
-- that does not match its row can be rejected. This migration only adds the
-- functions; wiring into confirm_import follows in a later migration once parity
-- with lib/canonical.ts is proven.
--
-- Parity basis: private.normalize_source_text mirrors lib/canonical.ts
-- normalizeSourceText (Unicode NFKC then collapse the JS whitespace set — including
-- U+FEFF, which NFKC does not fold and Postgres \s does not match — to a single
-- space, then trim). Verified 0 mismatches over 50k random realistic-charset
-- strings; the only full-Unicode divergence is NFKC version skew on codepoints
-- newer than Postgres's Unicode data, which the source-text charset guard excludes.

create or replace function private.normalize_source_text(p_value text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select case
    when p_value is null then null
    else btrim(regexp_replace(
      normalize(p_value, NFKC),
      E'[ \\f\\n\\r\\t\\u000b\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+',
      ' ', 'g'))
  end
$$;
revoke all on function private.normalize_source_text(text) from public, anon, authenticated;

-- Recompute a source row's fingerprint from its immutable identity facts, matching
-- lib/canonical.ts rowFingerprint: sha256 over the canonical JSON of
-- { version, accountId, bankCode, sourceDate, sourceTime, transactionLabel,
--   description, reference, withdrawal, deposit, postBalance, branch }, with the
-- four text fields normalized and the component sums rendered as canonical decimal
-- strings (deposits positive, withdrawals negative, absent kind => "0").
create or replace function private.row_fingerprint(p_account_id uuid, p_bank_code text, p_row jsonb)
returns text language sql immutable
set search_path = pg_catalog, private
as $$
  select private.sha256_jsonb(jsonb_build_object(
    'version', 'fingerprint-v1',
    'accountId', p_account_id::text,
    'bankCode', p_bank_code,
    'sourceDate', p_row->>'sourceDate',
    'sourceTime', p_row->'sourceTime',
    'transactionLabel', private.normalize_source_text(p_row->>'transactionLabel'),
    'description', private.normalize_source_text(p_row->>'description'),
    'reference', private.normalize_source_text(p_row->>'reference'),
    'withdrawal', (select coalesce(sum((c#>>'{amount,minor}')::numeric), 0)::text
                   from jsonb_array_elements(p_row->'components') c where c->>'kind' = 'withdrawal'),
    'deposit', (select coalesce(sum((c#>>'{amount,minor}')::numeric), 0)::text
                from jsonb_array_elements(p_row->'components') c where c->>'kind' = 'deposit'),
    'postBalance', p_row#>>'{postBalance,minor}',
    'branch', private.normalize_source_text(p_row->>'branch')
  ))
$$;
revoke all on function private.row_fingerprint(uuid, text, jsonb) from public, anon, authenticated;

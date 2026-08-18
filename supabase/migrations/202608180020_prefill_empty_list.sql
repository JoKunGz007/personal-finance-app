-- Migration 020 — an empty pre-fill list is a list, not a repeated name (D-122, PLAN task 37).
--
-- ## The defect
--
-- Migration 019 rejects a repeated field name by comparing the array's length against the count of
-- its distinct elements. **`array_length(arr, 1)` returns NULL for an empty array**, not 0, while
-- `count(distinct ...)` over no rows returns 0 — so `NULL is distinct from 0` is true and an empty
-- list raises `contains a repeated field name`. Two spellings of "nothing" behaved differently: an
-- absent key took the early return and was accepted, an explicit `[]` was refused.
--
-- ## Why it mattered, and why it is not urgent now
--
-- The card form sent both keys always, so `prefillChanged` was empty precisely when the owner
-- **changed nothing** — the outcome the whole pre-fill trial is hoping for. It surfaced on the first
-- real card read through Cloud Vision, where the reader filled all four fields correctly and the
-- capture was then refused (D-120, D-122). **A defect that only appears when the feature succeeds is
-- one a green gate does not find**, and this one had a full gate over it: every test for "no
-- pre-fill" omits the keys, and omitting never reaches the check.
--
-- The app has since sent an absent key for an empty list (`namesOrAbsent`), so nothing in this
-- deployment can reach the defect. This closes it in the database anyway, because the next caller
-- would meet it again and the message it raises names the wrong cause.
--
-- ## Scope
--
-- **No table, no column, no signature change** — one function body. The backup contract stays at
-- **v7** and no file anyone holds is stranded. `capture_notification_card` is untouched and picks up
-- the new body through the same call it already makes.

-- Reproduced whole rather than patched, on migration 019's own reasoning: `create or replace
-- function` replaces a body entire, so a migration showing only the changed line would leave the
-- current definition readable nowhere. Everything below is 019's function with one line changed,
-- marked.
create or replace function private.assert_prefill_field_names(p_value jsonb, p_label text)
returns text[] language plpgsql immutable
as $$
declare
  v_names text[];
begin
  -- Absent or null is an empty list. A card captured with no pre-fill offered is the ordinary
  -- case today and stays ordinary if the trial ends by simply not filling anything in.
  if p_value is null or jsonb_typeof(p_value) = 'null' then return array[]::text[]; end if;
  if jsonb_typeof(p_value) is distinct from 'array' then
    raise exception '% must be an array of field names', p_label;
  end if;
  -- Every element must be a string before the cast, or a nested object would arrive as text and
  -- carry whatever it was holding into an audit row.
  if exists (select 1 from jsonb_array_elements(p_value) as e where jsonb_typeof(e) is distinct from 'string') then
    raise exception '% must contain only field names', p_label;
  end if;
  select array_agg(e #>> '{}') into v_names from jsonb_array_elements(p_value) as e;
  v_names := coalesce(v_names, array[]::text[]);
  if exists (select 1 from unnest(v_names) as n where n not in ('amount','balance','occurredAt','ownAccount')) then
    raise exception '% contains an unknown field name', p_label;
  end if;
  -- 020: `coalesce(..., 0)` is the whole fix. Without it an empty array measures NULL against a
  -- count of 0 and every empty list is reported as a duplicate. `cardinality(v_names)` would also
  -- answer 0 and is the tidier spelling; `coalesce` is used so the diff against 019 is one wrapped
  -- call rather than a swapped function, and the comparison stays legible beside the count.
  if coalesce(array_length(v_names, 1), 0) is distinct from (select count(distinct n) from unnest(v_names) as n) then
    raise exception '% contains a repeated field name', p_label;
  end if;
  return v_names;
end;
$$;
revoke all on function private.assert_prefill_field_names(jsonb, text) from public, anon, authenticated;

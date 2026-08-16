-- Migration 019 — what a card's pre-fill offered, and what the owner changed (PLAN task 34
-- part 3, D-114, D-115).
--
-- ## What this is for
--
-- D-114 put D-087 on trial rather than reversing it: a card's four digit-bearing fields are now
-- offered values read off the screenshot, and whether that *stays* is to be decided on evidence.
-- The evidence needs one thing the database does not record today — **which fields were offered a
-- value, and which of those the owner changed before submitting**.
--
-- **The trap in the obvious statistic is named in D-114 and is worth repeating where the data is
-- produced.** A low change rate is consistent with two opposite worlds: the engine is right, or
-- the owner stopped looking. This column cannot tell them apart and must never be read as if it
-- could. The check that *can* is the statement — a wrongly pre-filled figure fails to pair and
-- surfaces as `AWAITING STATEMENT` (D-102) — so what settles the trial is the pairing rate of
-- pre-filled cards against typed ones, and this record is the denominator for that comparison
-- rather than the answer to it.
--
-- ## Structure, never values
--
-- Only **field names** are stored, from a closed set of four. No amount, balance, date or account
-- digit enters an audit row, which is the same rule the capture event is already built to
-- (migration 016) and the rule `tests/privacy.test.ts` holds on the other side of the wire.
--
-- ## What this does not do, and why the backup contract does not move
--
-- **No new table and no new column.** The two arrays join the `detail` of the audit event
-- `capture_notification_card` already writes, and `audit_events` is already carried by
-- `export_backup_snapshot`. D-097's rule is about new owner data needing a new schema version;
-- a field name inside an existing jsonb detail is neither new owner data nor a new relation. So
-- the backup contract stays at **v7** and no file anyone holds is stranded.
--
-- **The function signature does not change either**, which is what makes this safe to deploy in
-- either order. `capture_notification_card` has always taken a single `jsonb`, so this adds two
-- optional keys to a payload rather than a parameter to a signature — no overload, no ambiguity,
-- and no window where the deployed app calls a function that no longer exists. **Absent means an
-- empty list, not an error**: the app in production today sends neither key, and it must keep
-- working unchanged after this lands. That is not politeness, it is the ordering rule (D-109) —
-- every push to `main` deploys, so a migration that refused the old payload would break card
-- capture from the moment it was applied until the app caught up.

-- ------------------------------------------------------- the closed set, in the database
--
-- Written here rather than trusted from the route, because the route is not the last boundary and
-- an audit row is append-only. `lib/notification-card-prefill.ts` holds the same four names on the
-- other side; they are the four digit-bearing fields a card stores, and the timestamp is one field
-- rather than two because the pairing rule uses the instant rather than the day.
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
  -- A field named twice would double-count it in any rate computed from these rows.
  if array_length(v_names, 1) is distinct from (select count(distinct n) from unnest(v_names) as n) then
    raise exception '% contains a repeated field name', p_label;
  end if;
  return v_names;
end;
$$;
revoke all on function private.assert_prefill_field_names(jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------- the capture path, unchanged but for this
--
-- Reproduced whole rather than patched: `create or replace function` replaces a body entire, and
-- a migration that showed only the changed lines would leave the current definition readable
-- nowhere. Everything below is migration 016's function except the two declarations, the two
-- validations and the two keys added to the audit detail, each marked.
create or replace function public.capture_notification_card(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_card public.notification_cards%rowtype;
  v_existing public.notification_cards%rowtype;
  v_amount text := p_request->>'amountMinor';
  v_balance text := p_request->>'balanceMinor';
  v_account uuid;
  v_channel text := p_request->>'channel';
  v_bank text;
  v_account_bank text;
  v_occurred_on date;
  v_occurred_at_time time;
  v_fingerprint text;
  v_captured boolean := true;
  -- 019: the two lists, validated below before anything is written.
  v_prefill_offered text[];
  v_prefill_changed text[];
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;

  -- The bank each channel belongs to. Written once, here, rather than restated per row:
  -- migration 009 exists because `confirm_import` restated 'KTB' as a literal and silently
  -- gated two banks out of the product (D-041).
  v_bank := case v_channel
    when 'SCB Connect' then 'SCB'
    when 'KBank Live' then 'KBANK'
    when 'Krungthai Connext' then 'KTB'
  end;
  if v_bank is null then raise exception 'unknown notification card channel'; end if;

  -- 019: validated here, with the other payload checks, so a malformed list is refused before a
  -- row is written rather than after. `changed` must be a subset of `offered` — a field the owner
  -- changed that was never offered is not a correction, it is a caller with a broken model of its
  -- own form, and letting it through would silently inflate every rate computed from these rows.
  v_prefill_offered := private.assert_prefill_field_names(p_request->'prefillOffered', 'prefillOffered');
  v_prefill_changed := private.assert_prefill_field_names(p_request->'prefillChanged', 'prefillChanged');
  if exists (select 1 from unnest(v_prefill_changed) as n where n <> all (v_prefill_offered)) then
    raise exception 'prefillChanged must be a subset of prefillOffered';
  end if;

  -- Money crosses the wire as canonical text and is validated as such before any cast, for
  -- both figures. A value outside int64 would otherwise surface as an uncaught 22P02 halfway
  -- through rather than as a refusal the route can map.
  if jsonb_typeof(p_request->'amountMinor') is distinct from 'string'
    or not private.is_canonical_int64_text(v_amount)
    then raise exception 'notification card amount must be canonical int64 text'; end if;
  if jsonb_typeof(p_request->'balanceMinor') is distinct from 'string'
    or not private.is_canonical_int64_text(v_balance)
    then raise exception 'notification card balance must be canonical int64 text'; end if;

  begin
    v_account := (p_request->>'accountId')::uuid;
    v_occurred_on := (p_request->>'occurredOn')::date;
    v_occurred_at_time := (p_request->>'occurredAtTime')::time;
  exception when others then raise exception 'invalid notification card'; end;
  if v_occurred_at_time is null then raise exception 'notification card requires a time'; end if;

  -- The same fail-closed window `capture_slip` uses, and for the same reason: a Thai card
  -- printing a two-digit Buddhist year resolved with the wrong era rule lands 543 years out,
  -- which is D-031 exactly. `lib/notification-card.ts` resolves the era per layout; this is the
  -- second boundary that refuses the answer if it did not.
  if v_occurred_on > current_date + 1 or v_occurred_on < (current_date - interval '10 years')::date then
    raise exception 'notification card date is outside the plausible window';
  end if;

  -- The account must be the owner's, and the channel must belong to that account's bank. The
  -- second check is what stops an SCB card being bound to a KBank account whose printed digits
  -- happened to match — the per-layout digit rule narrows the candidates, and this refuses the
  -- pairing outright when the bank disagrees.
  select bank_code into v_account_bank from public.accounts where id = v_account and owner_id = v_owner;
  if v_account_bank is null then raise exception 'notification card account not owned'; end if;
  if v_account_bank is distinct from v_bank then
    raise exception 'notification card channel does not match the account bank';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  v_fingerprint := private.notification_card_fingerprint(
    v_account, v_channel, p_request->>'kind', v_amount::bigint,
    v_occurred_on, v_occurred_at_time, v_balance::bigint);

  select * into v_existing from public.notification_cards
    where owner_id = v_owner and fingerprint = v_fingerprint;
  if v_existing.id is not null then
    v_card := v_existing;
    v_captured := false;
  else
    begin
      insert into public.notification_cards(owner_id, account_id, channel, printed_account_digits, kind,
        amount_minor, currency, occurred_on, occurred_at_time, balance_minor, counterparty, category_id,
        note, fingerprint_version, fingerprint)
      values (v_owner, v_account, v_channel, p_request->>'printedAccountDigits', p_request->>'kind',
        v_amount::bigint, coalesce(p_request->>'currency','THB'), v_occurred_on, v_occurred_at_time,
        v_balance::bigint, nullif(btrim(coalesce(p_request->>'counterparty','')),''),
        nullif(p_request->>'categoryId','')::uuid, nullif(p_request->>'note',''),
        'card-fingerprint-v1', v_fingerprint)
      returning * into v_card;
    exception
      when check_violation then raise exception 'invalid notification card';
      when foreign_key_violation then raise exception 'notification card category not owned';
      when not_null_violation then raise exception 'invalid notification card';
      when invalid_text_representation then raise exception 'invalid notification card';
      -- Unreachable while the select above holds the advisory lock, but a unique violation
      -- here would mean the dedup check and the constraint disagree, which is worth naming.
      when unique_violation then raise exception 'notification card already captured';
    end;

    -- Structure, never values: no amount, balance, counterparty or account digits.
    -- 019 adds the two pre-fill lists, which are field names and are held to the same rule.
    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'notification_card.capture', 'notification_card', v_card.id,
        jsonb_build_object('channel', v_card.channel, 'kind', v_card.kind,
          'occurred_on', v_card.occurred_on, 'currency', v_card.currency,
          'prefill_offered', to_jsonb(v_prefill_offered),
          'prefill_changed', to_jsonb(v_prefill_changed)));

    update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  end if;

  return jsonb_build_object('captured', v_captured, 'card',
    to_jsonb(v_card) - 'amount_minor' - 'balance_minor'
      || jsonb_build_object('amount_minor', v_card.amount_minor::text,
                            'balance_minor', v_card.balance_minor::text));
end;
$$;
revoke all on function public.capture_notification_card(jsonb) from public, anon;
grant execute on function public.capture_notification_card(jsonb) to authenticated;

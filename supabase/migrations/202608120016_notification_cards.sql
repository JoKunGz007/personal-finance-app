-- A bank's LINE push notification, captured as a payment record (PLAN task 27).
--
-- Not every payment produces the QR-bearing e-slip migration 011 reads. When one does not,
-- the bank's own LINE channel still pushes a card carrying the transaction and the owner
-- screenshots it — several times a week, which is what moved this from "type it in as cash"
-- to a built path.
--
-- ## Why a card is neither a slip nor a cash entry
--
--   * **Not a slip.** `public.slips` is built around `slip_reference`, and
--     `unique (owner_id, bank_code, slip_reference)` is what makes re-sharing a slip a no-op.
--     The QR's CRC is what makes that key trustworthy. A card has neither a reference nor a
--     QR, and `slips_immutable` forbids retrofitting one onto an existing row.
--   * **Not a cash entry.** Cash is never matched to a statement row, because there is no row
--     it could collapse onto. A card is a bank transaction with a printed running balance, so
--     it certainly will be.
--
-- ## Identity is a computed fingerprint, and it is weaker than a slip's on purpose
--
-- The precedent is the statement importer, which faces exactly this problem — a statement row
-- carries no bank-issued id either — and answers it with `private.row_fingerprint`. The same
-- shape applies here. **Record what it is not**: a fingerprint is idempotent, not
-- tamper-evident, which is strictly weaker than what a CRC-protected reference gives a slip.
-- It is computed **here**, from the stored facts, and never accepted from the caller —
-- migration 005 exists because a caller-supplied digest is not evidence of anything (D-012).
--
-- ## The balance is stored because it was measured, and it does three jobs
--
-- Measured against the hosted ledger on 2026-08-12: for all six real cards a transaction
-- exists at the same account, the same date **and the same time**, carrying a balance equal to
-- the card's to the satang. Not close — equal. So the balance (a) breaks the tie the amount
-- cannot, since two same-amount rows never share a running balance, (b) is a fail-closed
-- cross-check, and (c) strengthens the fingerprint. **Limits kept deliberately**: n is 6, and
-- none was captured while a hold was outstanding — two layouts label the field *available*
-- balance and the third *remaining*, which diverge at many banks exactly when a hold exists.
-- Proven enough to be a tie-breaker and a cross-check; **not** enough to be identity, which is
-- why the fingerprint carries the account, the timestamp and the amount as well.
--
-- ## The account is bound at capture, and the binding rule is per-layout
--
-- `lib/notification-card.ts` owns that rule and states why it can never be global: SCB Connect
-- and Krungthai Connext print the account's **last four**, which is what `accounts.last_four`
-- stores, while KBank Live formats `xxx-x-xxxxx-x` and reveals digits **6–9** with the last
-- masked. Comparing those directly matches nothing, on every card, forever — and it fails as
-- *no such account* rather than as an error. This table stores the resolved `account_id` and
-- the digits as printed, so a row records what was read and not only what it was mapped to.
--
-- ## Backup 5 -> 6, in this same migration, because it cannot be deferred
--
-- `export_backup_snapshot` serialises whole rows with `to_jsonb`, so the moment this table
-- exists the export must carry it or the backup silently stops covering every owner table and
-- `SPEC.md` gate 6 is broken. v2, v3, v4 and v5 all stay restorable forever, for the reason
-- that has not weakened once: a version that stops being restorable strands whatever the owner
-- took under it. This is a new table and no new column, which is D-097's rule.
--
-- ## Deliberately not here, and what each would cost
--
-- A card carries **no correction overlay and no stored match decision** yet. Both are real and
-- both are wanted — the slip path grew them in migrations 013 and 012 respectively — but
-- neither is designed, and each needs its own table, so each costs a further version bump.
-- Building undesigned tables now to save that bump is the wrong trade: D-097 measured the cost
-- of appending a table and found it does not compound. Recorded as a known limitation rather
-- than an oversight, exactly as migration 011 recorded the slip correction it left out.

begin;

create table public.notification_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  -- The card names an account and prints that account's running balance, so unlike a slip
  -- this row is bound to one at capture. A slip carries no account because its QR names only
  -- a bank and the statement is what eventually says which account it was; a card has already
  -- answered that question, and the balance is meaningless without it.
  account_id uuid not null,
  -- The LINE channel as it identifies itself, kept distinct from the bank it belongs to. The
  -- bank is on the account; storing it here as well would create two places for one fact that
  -- could disagree. `capture_notification_card` checks the channel against the account's bank
  -- instead, which is a live check rather than a duplicated column.
  channel text not null check (channel in ('SCB Connect','KBank Live','Krungthai Connext')),
  -- The four digits the card printed, as printed — never reordered, padded or normalised into
  -- the stored `last_four`. For KBank Live these are digits 6–9 of ten and are *not* the last
  -- four, and a row that silently recorded them as such would erase the evidence that the
  -- offset was applied at all.
  printed_account_digits text not null check (printed_account_digits ~ '^[0-9]{4}$'),
  -- The same two words `source_components`, `public.slips` and `public.cash_entries` use, so
  -- the ledger view keeps one vocabulary for one concept.
  kind text not null check (kind in ('deposit','withdrawal')),
  amount_minor bigint not null,
  currency text not null check (currency = 'THB'),
  occurred_on date not null,
  -- Not nullable, unlike a slip's. All three layouts print `hh:mm`, and the time is
  -- load-bearing rather than decorative: it equalled the statement row's on all six measured
  -- cards, so account plus date plus time already locates the row and the balance confirms it.
  occurred_at_time time not null,
  -- The account's running balance after this transaction, as printed on the card.
  balance_minor bigint not null,
  -- Only Krungthai Connext names the other side of the transfer. Null elsewhere is the
  -- ordinary case rather than a parse failure.
  counterparty text check (counterparty is null or length(btrim(counterparty)) between 1 and 240),
  category_id uuid,
  note text check (note is null or length(note) <= 2000),
  fingerprint_version text not null check (fingerprint_version = 'card-fingerprint-v1'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null default now(),
  foreign key (account_id, owner_id) references public.accounts(id, owner_id),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  check ((kind = 'deposit' and amount_minor > 0) or (kind = 'withdrawal' and amount_minor < 0)),
  -- The dedup key. Re-capturing the same screenshot is the expected accident here for the same
  -- reason it is with share-to-app, and the fingerprint is what makes the second one a no-op.
  unique (owner_id, fingerprint),
  unique (id, owner_id)
);

create index notification_cards_owner_occurred_on on public.notification_cards(owner_id, occurred_on);
create index notification_cards_owner_account on public.notification_cards(owner_id, account_id, occurred_on);

-- Append-only, like every other ledger-fact table. The confirm form is the review step: the
-- owner reads the amount off the card and types it, and no machine-read digit reaches a stored
-- value (D-087). Correcting a captured card is not offered yet — see the header.
create trigger notification_cards_immutable before update or delete on public.notification_cards
  for each row execute function private.reject_change();

alter table public.notification_cards enable row level security;
alter table public.notification_cards force row level security;
create policy strong_owner_select on public.notification_cards for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.notification_cards to authenticated;
-- The only write path is `capture_notification_card`. Stated rather than assumed, matching
-- migrations 010 to 013: a future blanket grant must not quietly open a way around it.
revoke insert, update, delete on public.notification_cards from authenticated, anon;

-- ------------------------------------------------------------------ identity

/*
 * A card's fingerprint, computed from the facts the row stores.
 *
 * Modelled on `private.row_fingerprint`, and different from it in one way worth naming: there
 * is no client counterpart to keep parity with. `confirm_import` recomputes a fingerprint the
 * client also computed, because the client needs one to dedupe against before it posts; a card
 * is a single row confirmed by hand, so the only fingerprint that ever exists is this one. No
 * caller can supply, influence or replay it.
 *
 * The account id rather than the printed digits: those are per-layout and, for KBank Live, do
 * not even identify the account on their own. The resolved account does, and it also pins the
 * bank without restating it.
 */
create or replace function private.notification_card_fingerprint(
  p_account_id uuid, p_channel text, p_kind text, p_amount_minor bigint,
  p_occurred_on date, p_occurred_at_time time, p_balance_minor bigint
) returns text language sql immutable
set search_path = pg_catalog, private
as $$
  select private.sha256_jsonb(jsonb_build_object(
    'version', 'card-fingerprint-v1',
    'accountId', p_account_id::text,
    'channel', p_channel,
    'kind', p_kind,
    'amount', p_amount_minor::text,
    'occurredOn', to_char(p_occurred_on, 'YYYY-MM-DD'),
    'occurredAtTime', to_char(p_occurred_at_time, 'HH24:MI:SS'),
    'balance', p_balance_minor::text
  ))
$$;
revoke all on function private.notification_card_fingerprint(uuid,text,text,bigint,date,time,bigint)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- write path

/*
 * Capturing a card. Idempotent on the computed fingerprint, and the caller is told which of
 * the two things happened — captured, or already held — exactly as `capture_slip` does it.
 *
 * A re-capture returns the stored row unchanged even when the owner types a different amount
 * the second time. That is not tidiness: the table is append-only, so silently overwriting a
 * confirmed value would be worse than refusing to. It is also the honest consequence of a
 * fingerprint that includes the amount — a different amount is a *different* fingerprint and
 * therefore a second row, which is why the refusal path below can only be reached by an exact
 * re-capture. Both readings are correct and neither loses a value the owner confirmed.
 */
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
    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'notification_card.capture', 'notification_card', v_card.id,
        jsonb_build_object('channel', v_card.channel, 'kind', v_card.kind,
          'occurred_on', v_card.occurred_on, 'currency', v_card.currency));

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

-- ------------------------------------------------------------- backup 5 -> 6

alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3,4,5,6));

-- The second place the table list is written down (migration 004's CHECK on staged chunks).
-- Both enumerations have to move together: a chunk kind missing here is refused by the
-- constraint before `restore_backup` ever sees it, and the failure surfaces as a raw row-level
-- violation naming a chunk index rather than as a contract error.
alter table public.restore_chunks
  drop constraint if exists restore_chunks_v2_binding,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions',
        'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
        'mutation_sequences','slips','slip_match_overlays','slip_match_revisions',
        'cash_entries','cash_entry_overlays','cash_entry_revisions',
        'slip_correction_overlays','slip_correction_revisions','notification_cards')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

-- Appended, never slotted in: the manifest binds a chunk to its index, so reordering would
-- invalidate every existing descriptor in a way no digest could distinguish from tampering.
-- Indices 0..18 keep meaning exactly what they meant in v5.
create or replace function public.export_backup_snapshot()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_at timestamptz:=clock_timestamp(); v_sequence bigint; v_data jsonb; v_counts jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  select sequence into v_sequence from public.mutation_sequences where owner_id=v_owner;
  v_data:=jsonb_build_object(
    'accounts',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.accounts where owner_id=v_owner) x),
    'categories',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.categories where owner_id=v_owner) x),
    'import_artifacts',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.import_artifacts where owner_id=v_owner) x),
    'import_batches',(select coalesce(jsonb_agg(to_jsonb(x)-'opening_balance_minor'-'closing_balance_minor'||jsonb_build_object('opening_balance_minor',opening_balance_minor::text,'closing_balance_minor',closing_balance_minor::text) order by id),'[]') from public.import_batches x where owner_id=v_owner),
    'source_transactions',(select coalesce(jsonb_agg(to_jsonb(x)-'post_balance_minor'||jsonb_build_object('post_balance_minor',post_balance_minor::text) order by id),'[]') from public.source_transactions x where owner_id=v_owner),
    'source_components',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by transaction_id,position),'[]') from public.source_components x where owner_id=v_owner),
    'import_batch_rows',(select coalesce(jsonb_agg(to_jsonb(x) order by batch_id,source_index),'[]') from public.import_batch_rows x where owner_id=v_owner),
    'transaction_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id),'[]') from public.transaction_overlays x where owner_id=v_owner),
    'overlay_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id,revision),'[]') from public.overlay_revisions x where owner_id=v_owner),
    'audit_events',(select coalesce(jsonb_agg(to_jsonb(x)-'id'||jsonb_build_object('id',id::text) order by id),'[]') from public.audit_events x where owner_id=v_owner),
    'mutation_sequences',(select coalesce(jsonb_agg(to_jsonb(x)-'sequence'-'last_exported_sequence'||jsonb_build_object('sequence',sequence::text,'last_exported_sequence',last_exported_sequence::text) order by owner_id),'[]') from public.mutation_sequences x where owner_id=v_owner),
    'slips',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by id),'[]') from public.slips x where owner_id=v_owner),
    'slip_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id),'[]') from public.slip_match_overlays x where owner_id=v_owner),
    'slip_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id,revision),'[]') from public.slip_match_revisions x where owner_id=v_owner),
    'cash_entries',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by id),'[]') from public.cash_entries x where owner_id=v_owner),
    'cash_entry_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by cash_entry_id),'[]') from public.cash_entry_overlays x where owner_id=v_owner),
    'cash_entry_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by cash_entry_id,revision),'[]') from public.cash_entry_revisions x where owner_id=v_owner),
    'slip_correction_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by slip_id),'[]') from public.slip_correction_overlays x where owner_id=v_owner),
    'slip_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id,revision),'[]') from public.slip_correction_revisions x where owner_id=v_owner),
    -- Both figures leave as canonical text. The balance is money and is held to the same rule
    -- as every other amount in this file, rather than being treated as metadata because it
    -- happens not to be the transaction's own value.
    'notification_cards',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'-'balance_minor'
      ||jsonb_build_object('amount_minor',amount_minor::text,'balance_minor',balance_minor::text) order by id),'[]')
      from public.notification_cards x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',6,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

-- The kind list is built up by version, so a seventh version adds one line and strands nothing.
create or replace function public.restore_backup(p_action text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
 v_owner uuid:=auth.uid(); v_restore uuid; v_idempotency uuid; v_digest text;
 v_run public.restore_runs%rowtype; v_descriptor jsonb; v_chunk record; v_row jsonb;
 v_index integer; v_kind text; v_count integer; v_chunk_digest text; v_manifest jsonb; v_payload jsonb;
 v_base_kinds text[]:=array['accounts','categories','import_artifacts','import_batches','source_transactions',
  'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events','mutation_sequences'];
 v_expected_kinds text[]; v_kind_count integer; v_schema integer; v_schema_text text;
 v_restored_sequence bigint;
begin
 if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
 begin
  v_restore:=(p_request->>'restoreId')::uuid; v_idempotency:=(p_request->>'idempotencyKey')::uuid; v_digest:=p_request->>'digest';
 exception when others then raise exception 'invalid restore contract'; end;
 v_schema_text:=p_request->>'schemaVersion';
 if v_schema_text not in ('2','3','4','5','6') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 v_schema:=v_schema_text::integer;
 v_expected_kinds:=v_base_kinds;
 if v_schema>=3 then v_expected_kinds:=v_expected_kinds||array['slips']; end if;
 if v_schema>=4 then v_expected_kinds:=v_expected_kinds||array['slip_match_overlays','slip_match_revisions']; end if;
 if v_schema>=5 then v_expected_kinds:=v_expected_kinds||array['cash_entries','cash_entry_overlays','cash_entry_revisions','slip_correction_overlays','slip_correction_revisions']; end if;
 if v_schema>=6 then v_expected_kinds:=v_expected_kinds||array['notification_cards']; end if;
 v_kind_count:=array_length(v_expected_kinds,1);
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  if p_action='stage' then
   v_manifest:=p_request->'manifest';
   if jsonb_typeof(v_manifest) is distinct from 'object'
     or jsonb_typeof(v_manifest->'payloadDigest') is distinct from 'string'
     or v_manifest->>'payloadDigest' is distinct from v_digest
     or jsonb_typeof(v_manifest->'snapshotSequence') is distinct from 'string'
     or not private.is_canonical_int64_text(v_manifest->>'snapshotSequence',true)
     or (v_manifest->>'snapshotSequence')::numeric >= 9223372036854775807
     or jsonb_typeof(v_manifest->'exportedAt') is distinct from 'string'
     or jsonb_typeof(v_manifest->'chunks') is distinct from 'array'
     or jsonb_array_length(v_manifest->'chunks')<>v_kind_count
     or jsonb_typeof(v_manifest->'tableCounts') is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_manifest->'tableCounts'))<>v_kind_count
     or (v_manifest->>'exportedAt')::timestamptz is null then raise exception 'invalid restore manifest'; end if;
  for v_index in 0..v_kind_count-1 loop
   v_descriptor:=v_manifest->'chunks'->v_index;
   v_kind:=v_expected_kinds[v_index+1];
    if jsonb_typeof(v_descriptor) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_descriptor))<>4
      or not (v_manifest->'tableCounts' ? v_kind)
      or jsonb_typeof(v_manifest#>array['tableCounts',v_kind]) is distinct from 'number'
      or jsonb_typeof(v_descriptor->'index') is distinct from 'number'
      or jsonb_typeof(v_descriptor->'rowCount') is distinct from 'number'
      or (v_manifest#>>array['tableCounts',v_kind]) !~ '^(0|[1-9][0-9]*)$'
      or (v_descriptor->>'rowCount') !~ '^(0|[1-9][0-9]*)$'
      or (v_descriptor->>'index')::integer is distinct from v_index
      or v_descriptor->>'kind' is distinct from v_kind
      or (v_descriptor->>'rowCount')::integer<0
      or v_descriptor->>'sha256' is null or v_descriptor->>'sha256'!~'^[a-f0-9]{64}$'
      or (v_manifest#>>array['tableCounts',v_kind])::integer is distinct from (v_descriptor->>'rowCount')::integer
      or (v_kind='mutation_sequences' and (v_descriptor->>'rowCount')::integer<>1)
      then raise exception 'invalid restore manifest descriptor'; end if;
  end loop;
  select * into v_run from public.restore_runs where owner_id=v_owner and idempotency_key=v_idempotency;
  if v_run.id is not null then
   if v_run.id<>v_restore or v_run.payload_digest<>v_digest or v_run.manifest<>v_manifest
     or v_run.schema_version is distinct from v_schema then raise exception 'restore idempotency conflict'; end if;
   return to_jsonb(v_run);
  end if;
  insert into public.restore_runs(id,owner_id,idempotency_key,schema_version,payload_digest,status,manifest,snapshot_sequence)
   values(v_restore,v_owner,v_idempotency,v_schema,v_digest,'staged',v_manifest,(v_manifest->>'snapshotSequence')::bigint) returning * into v_run;
  return to_jsonb(v_run);
 end if;
  select * into v_run from public.restore_runs where id=v_restore and owner_id=v_owner for update;
  if v_run.id is null or v_run.schema_version is distinct from v_schema
    or v_run.idempotency_key is distinct from v_idempotency
    or v_run.payload_digest is distinct from v_digest then raise exception 'restore session not found'; end if;
  if p_action='abort' then
   if v_run.status='applied' then return to_jsonb(v_run); end if;
   if v_run.status<>'staged' then raise exception 'restore is not staged'; end if;
   delete from public.restore_chunks where restore_id=v_restore and owner_id=v_owner;
   update public.restore_runs set status='aborted' where id=v_restore returning * into v_run; return to_jsonb(v_run);
 elsif p_action='chunk' then
  if v_run.status<>'staged' or jsonb_typeof(p_request->'chunk')<>'object'
    or jsonb_typeof(p_request#>'{chunk,rows}')<>'array' then raise exception 'restore is not accepting chunks'; end if;
  v_index:=(p_request->>'chunkIndex')::integer; v_kind:=p_request#>>'{chunk,kind}'; v_chunk_digest:=p_request->>'chunkDigest';
   if v_index not between 0 and v_kind_count-1 or v_kind is distinct from v_expected_kinds[v_index+1] then raise exception 'restore chunk ordering mismatch'; end if;
   v_descriptor:=v_run.manifest->'chunks'->v_index;
   v_count:=jsonb_array_length(p_request#>'{chunk,rows}');
   if v_kind is distinct from v_descriptor->>'kind'
     or v_count is distinct from (v_descriptor->>'rowCount')::integer
     or v_chunk_digest is distinct from v_descriptor->>'sha256'
     or private.sha256_jsonb(p_request->'chunk') is distinct from v_chunk_digest
     then raise exception 'restore chunk binding mismatch'; end if;
   if v_kind='mutation_sequences' then
    v_row:=p_request#>'{chunk,rows,0}';
    if v_count<>1
      or jsonb_typeof(v_row->'sequence') is distinct from 'string'
      or jsonb_typeof(v_row->'last_exported_sequence') is distinct from 'string'
      or not private.is_canonical_int64_text(v_row->>'sequence',true)
      or not private.is_canonical_int64_text(v_row->>'last_exported_sequence',true)
      or (v_row->>'sequence')::bigint is distinct from v_run.snapshot_sequence
      or (v_row->>'last_exported_sequence')::bigint>(v_row->>'sequence')::bigint
      then raise exception 'restore mutation sequence mismatch'; end if;
   end if;
  if exists(select 1 from public.restore_chunks where restore_id=v_restore and chunk_index=v_index
    and (chunk<>p_request->'chunk' or chunk_digest<>v_chunk_digest)) then raise exception 'restore chunk overwrite rejected'; end if;
  insert into public.restore_chunks(owner_id,restore_id,chunk_index,chunk,chunk_kind,row_count,chunk_digest)
   values(v_owner,v_restore,v_index,p_request->'chunk',v_kind,v_count,v_chunk_digest) on conflict(restore_id,chunk_index) do nothing;
  return jsonb_build_object('id',v_restore,'status','staged','chunkIndex',v_index);
 elsif p_action<>'commit' then raise exception 'unknown restore action'; end if;
 if v_run.status='applied' then return to_jsonb(v_run); end if;
 if v_run.status<>'staged' then raise exception 'restore is not staged'; end if;
  if exists(select 1 from public.accounts where owner_id=v_owner)
    or exists(select 1 from public.import_artifacts where owner_id=v_owner)
    or exists(select 1 from public.import_batches where owner_id=v_owner)
    or exists(select 1 from public.source_transactions where owner_id=v_owner)
    or exists(select 1 from public.source_components where owner_id=v_owner)
    or exists(select 1 from public.import_batch_rows where owner_id=v_owner)
    or exists(select 1 from public.transaction_overlays where owner_id=v_owner)
    or exists(select 1 from public.overlay_revisions where owner_id=v_owner)
    or exists(select 1 from public.audit_events where owner_id=v_owner)
    or exists(select 1 from public.slips where owner_id=v_owner)
    or exists(select 1 from public.slip_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.slip_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.cash_entries where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_overlays where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_revisions where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_revisions where owner_id=v_owner)
    -- Cards count as records for the same reason every table above does: the question is
    -- whether this ledger already holds anything, not whether the payload has an opinion.
    or exists(select 1 from public.notification_cards where owner_id=v_owner)
    then raise exception 'restore destination ledger is not empty'; end if;
 if (select count(*) from public.restore_chunks where restore_id=v_restore and owner_id=v_owner)<>v_kind_count then raise exception 'restore chunks incomplete'; end if;
 v_payload:=jsonb_build_object('schemaVersion',v_schema,'exportedAt',v_run.manifest->'exportedAt',
   'snapshotSequence',v_run.manifest->'snapshotSequence','tableCounts',v_run.manifest->'tableCounts','data','{}'::jsonb);
 for v_index in 0..v_kind_count-1 loop
  select * into v_chunk from public.restore_chunks where restore_id=v_restore and owner_id=v_owner and chunk_index=v_index;
  v_descriptor:=v_run.manifest->'chunks'->v_index;
   if v_chunk.chunk_kind is distinct from v_expected_kinds[v_index+1]
     or v_chunk.row_count is distinct from jsonb_array_length(v_chunk.chunk->'rows')
     or v_chunk.chunk_digest is distinct from private.sha256_jsonb(v_chunk.chunk)
     or v_chunk.chunk_digest is distinct from v_descriptor->>'sha256'
     then raise exception 'restore chunk altered'; end if;
  v_payload:=jsonb_set(v_payload,array['data',v_chunk.chunk_kind],v_chunk.chunk->'rows',true);
 end loop;
 if private.sha256_jsonb(v_payload)<>v_run.payload_digest then raise exception 'restore aggregate digest mismatch'; end if;
 delete from public.categories where owner_id=v_owner;
 for v_chunk in select * from public.restore_chunks where restore_id=v_restore and owner_id=v_owner order by chunk_index loop
  for v_row in select value from jsonb_array_elements(v_chunk.chunk->'rows') loop
   case v_chunk.chunk_kind
   when 'accounts' then insert into public.accounts(id,owner_id,bank_code,label,account_type,last_four,currency,timezone,created_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'bank_code',v_row->>'label',v_row->>'account_type',v_row->>'last_four',v_row->>'currency',v_row->>'timezone',(v_row->>'created_at')::timestamptz);
   when 'categories' then insert into public.categories(id,owner_id,name,archived,created_at,updated_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'name',(v_row->>'archived')::boolean,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz);
   when 'import_artifacts' then insert into public.import_artifacts(id,owner_id,artifact_digest,contract_version,created_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'artifact_digest',v_row->>'contract_version',(v_row->>'created_at')::timestamptz);
    when 'import_batches' then
     if jsonb_typeof(v_row->'opening_balance_minor') is distinct from 'string'
       or jsonb_typeof(v_row->'closing_balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'opening_balance_minor')
       or not private.is_canonical_int64_text(v_row->>'closing_balance_minor')
       then raise exception 'restore import-batch money must be canonical int64 text'; end if;
     insert into public.import_batches(id,owner_id,account_id,artifact_id,idempotency_key,payload_digest,status,confirmed_at,period_start,period_end,opening_balance_minor,closing_balance_minor,currency)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,(v_row->>'artifact_id')::uuid,(v_row->>'idempotency_key')::uuid,v_row->>'payload_digest',v_row->>'status',(v_row->>'confirmed_at')::timestamptz,
        (v_row->>'period_start')::date,(v_row->>'period_end')::date,(v_row->>'opening_balance_minor')::bigint,(v_row->>'closing_balance_minor')::bigint,v_row->>'currency');
    when 'source_transactions' then
     if jsonb_typeof(v_row->'post_balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'post_balance_minor')
       then raise exception 'restore transaction money must be canonical int64 text'; end if;
     insert into public.source_transactions(id,owner_id,account_id,fingerprint_version,fingerprint,source_date,source_time,effective_date,transaction_label,description,reference,branch,post_balance_minor,currency,created_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,v_row->>'fingerprint_version',v_row->>'fingerprint',(v_row->>'source_date')::date,nullif(v_row->>'source_time','')::time,(v_row->>'effective_date')::date,v_row->>'transaction_label',v_row->>'description',v_row->>'reference',v_row->>'branch',(v_row->>'post_balance_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
    when 'source_components' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore component money must be canonical int64 text'; end if;
     insert into public.source_components(id,owner_id,transaction_id,position,kind,amount_minor,currency,created_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'position')::smallint,v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
   when 'import_batch_rows' then insert into public.import_batch_rows(id,owner_id,batch_id,transaction_id,source_index,page,row_number,parser_fields,linked_existing)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'batch_id')::uuid,(v_row->>'transaction_id')::uuid,(v_row->>'source_index')::integer,(v_row->>'page')::integer,(v_row->>'row_number')::integer,v_row->'parser_fields',(v_row->>'linked_existing')::boolean);
   when 'transaction_overlays' then insert into public.transaction_overlays(transaction_id,owner_id,category_id,description,counterparty,effective_date,note,include_in_reporting,revision,updated_at)
    values((v_row->>'transaction_id')::uuid,v_owner,nullif(v_row->>'category_id','')::uuid,v_row->>'description',v_row->>'counterparty',nullif(v_row->>'effective_date','')::date,v_row->>'note',(v_row->>'include_in_reporting')::boolean,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'overlay_revisions' then insert into public.overlay_revisions(id,owner_id,transaction_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'audit_events' then
     if jsonb_typeof(v_row->'id') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'id',true)
       then raise exception 'restore audit id must be canonical int64 text'; end if;
     insert into public.audit_events(id,owner_id,actor_id,event_type,entity_type,entity_id,detail,occurred_at) overriding system value
      values((v_row->>'id')::bigint,v_owner,v_owner,v_row->>'event_type',v_row->>'entity_type',(v_row->>'entity_id')::uuid,v_row->'detail',(v_row->>'occurred_at')::timestamptz);
    when 'slips' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore slip money must be canonical int64 text'; end if;
     insert into public.slips(id,owner_id,bank_code,bank_qr_code,slip_reference,qr_payload,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,captured_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'bank_code',v_row->>'bank_qr_code',v_row->>'slip_reference',v_row->>'qr_payload',v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',
        (v_row->>'occurred_on')::date,nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'captured_at')::timestamptz);
   when 'slip_match_overlays' then insert into public.slip_match_overlays(slip_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'slip_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   -- Same owner rebind the overlay history needs: the snapshot carries an owner id, and every
   -- column-level check looks straight past it (D-044).
   when 'slip_match_revisions' then insert into public.slip_match_revisions(id,owner_id,slip_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'slip_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'cash_entries' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore cash entry money must be canonical int64 text'; end if;
     insert into public.cash_entries(id,owner_id,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,created_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'occurred_on')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'created_at')::timestamptz);
    when 'cash_entry_overlays' then
     -- Null stays null: an absent corrected amount means the original stands, and only a
     -- present one is held to the canonical-text rule.
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore cash correction money must be canonical int64 text'; end if;
     end if;
     insert into public.cash_entry_overlays(cash_entry_id,owner_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'cash_entry_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'occurred_on','')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'cash_entry_revisions' then insert into public.cash_entry_revisions(id,owner_id,cash_entry_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'cash_entry_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'slip_correction_overlays' then
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore slip correction money must be canonical int64 text'; end if;
     end if;
     insert into public.slip_correction_overlays(slip_id,owner_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'slip_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'occurred_on','')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'slip_correction_revisions' then insert into public.slip_correction_revisions(id,owner_id,slip_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'slip_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'notification_cards' then
     -- Both money columns, and the fingerprint travels rather than being recomputed. Recomputing
     -- it here would silently repair a file whose stored identity disagreed with its own row,
     -- which is the one thing a restore must never do quietly — the value is carried, and the
     -- table's own CHECK is what refuses a malformed one.
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       or jsonb_typeof(v_row->'balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'balance_minor')
       then raise exception 'restore notification card money must be canonical int64 text'; end if;
     insert into public.notification_cards(id,owner_id,account_id,channel,printed_account_digits,kind,amount_minor,currency,
       occurred_on,occurred_at_time,balance_minor,counterparty,category_id,note,fingerprint_version,fingerprint,captured_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,v_row->>'channel',v_row->>'printed_account_digits',v_row->>'kind',
        (v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'occurred_on')::date,(v_row->>'occurred_at_time')::time,
        (v_row->>'balance_minor')::bigint,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',
        v_row->>'fingerprint_version',v_row->>'fingerprint',(v_row->>'captured_at')::timestamptz);
    when 'mutation_sequences' then v_restored_sequence:=(v_row->>'sequence')::bigint;
   else raise exception 'unsupported restore chunk kind';
   end case;
  end loop;
 end loop;
 perform setval(pg_get_serial_sequence('public.audit_events','id'),greatest(coalesce((select max(id) from public.audit_events),1),1),true);
 update public.mutation_sequences set sequence=coalesce(v_restored_sequence,v_run.snapshot_sequence)+1,last_exported_sequence=0,updated_at=now() where owner_id=v_owner;
 update public.restore_runs set status='applied',applied_at=now() where id=v_restore returning * into v_run;
 return to_jsonb(v_run);
end;
$$;
revoke all on function public.restore_backup(text,jsonb) from public,anon;
grant execute on function public.restore_backup(text,jsonb) to authenticated;

commit;

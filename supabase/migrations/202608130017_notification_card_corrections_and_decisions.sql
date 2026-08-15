-- A card's correction overlay, its stored decision, and a way to retire one (PLAN task 29, D-103).
--
-- Migration 016 shipped `public.notification_cards` append-only and said in its own header that a
-- correction overlay and a stored match decision were both wanted, both undesigned, and each worth
-- its own version bump. D-102 then built the ledger view and the reconciliation, which is what made
-- the third gap visible: **nothing in any of the sixteen migrations can retire any record.** No
-- slip, no cash entry and no card can be withdrawn once captured, so every one counts in the ledger
-- totals forever. That rarely bites a slip, whose identity comes from a CRC-checked QR and which is
-- therefore seldom junk. A card is typed by hand from a screenshot, so a wrong account binding or a
-- second capture that typed something differently is a likelier accident.
--
-- All three land here, in one migration, because each needs a table and every table costs a backup
-- version bump. Designing them together is what makes that one bump rather than three.
--
-- ## Two tables copied from precedent rather than invented
--
--   * `notification_card_correction_overlays` copies `slip_correction_overlays` (migration 013):
--     one nullable column per correctable field, where **null means not corrected**. The original
--     row is never touched, so what was first typed survives beside what it was corrected to.
--   * `notification_card_decision_overlays` copies `slip_match_overlays` (migration 012): a
--     decision, an optimistic `revision`, an append-only revisions table, and a **partial unique
--     index of its own**.
--
-- **The index is deliberately not shared with the slip one.** A statement row may legitimately be
-- claimed by a slip *and* a card at once, because one payment can produce both an e-slip and a LINE
-- push — they are two pieces of evidence for one movement rather than rivals for a scarce row
-- (D-102). One card per transaction; one slip per transaction; both at once is fine.
--
-- **The name says `decision` where the slip's says `match`**, because this one has a third value
-- that is not a match at all.
--
-- ## What may be corrected, and what may not
--
-- Correctable: `kind`, `amount_minor`, `balance_minor`, `occurred_on`, `occurred_at_time`,
-- `counterparty`, `category_id`, `note` — every figure the owner typed off the screenshot.
--
-- **Not correctable: `account_id`, `channel` and `printed_account_digits`.** The binding was checked
-- against the printed digits under that layout's mask at capture, and that check cannot be re-made
-- after the fact — `POST /api/v1/notification-cards` is the only layer that can make it and the card
-- row is append-only (D-101, which says so in a message the capture form already shows the owner).
-- The channel and the digits are what that check was made against, so all three travel together. The
-- remedy for a wrong binding is retirement, below, followed by capturing it again correctly.
--
-- **The fingerprint is never recomputed.** It is the identity of *what was typed at capture*, not of
-- the payment, which is what keeps re-sharing the same screenshot a no-op after a correction. Same
-- posture as a slip correction leaving its QR reference alone.
--
-- ## Three decisions, and the third is the retirement
--
--   * `matched` names a statement row.
--   * `unmatched` says this card is on none of them.
--   * `not-a-payment` **retires it**: the card leaves the ledger rows and the totals while staying
--     in its append-only table, because nothing here is ever deleted.
--
-- Retirement is a decision rather than a fourth table, so one place answers what a card's
-- relationship to the ledger is. **It is reversible while the card row is not** — a decision is an
-- overlay carrying a revision, so a card retired by mistake is un-retired by changing the decision.
-- That is the append-only guarantee kept intact rather than worked around.
--
-- ## A balance disagreement may be overruled, and the consent is what is stored
--
-- D-102 made the printed balance a fail-closed cross-check: a card contradicting every row that
-- otherwise fits refuses to pair. `set_notification_card_decision` keeps that posture — it compares
-- and **refuses by default** — and lifts the refusal only when the caller passes an explicit
-- acknowledgement, which is then stored as `accepted_balance_mismatch`.
--
-- **Storing the consent rather than a computed flag is the load-bearing choice.** A flag saying
-- "these disagreed" is re-derivable at read time and would go stale the moment the balance is
-- corrected; a record saying "the owner accepted a mismatch" is a fact about a decision and never
-- does. Same shape as migration 012 storing the owner's disagreement with the rule rather than the
-- rule's own output.
--
-- The override exists because a **legitimate** disagreement is measured rather than hypothetical:
-- two layouts print an *available* balance and the third a *remaining* one, and those diverge
-- exactly when a hold is outstanding — a case never observed for these accounts
-- (`docs/NOTIFICATION_CARD_CONTRACT.md`). Refusing outright would leave a correct pairing
-- unrecordable, and the only workaround would be editing a figure read correctly off the screen.
--
-- ## Corrections are read before any rule that compares a figure
--
-- Both RPCs below work from the figure **in force** — the corrected one when a correction exists,
-- the card's own otherwise. Migration 014 exists because `set_slip_match` compared a slip's
-- *original* amount and both refused correct pairings and accepted wrong ones. A card has two
-- figures with that trap instead of one, since it reconciles on the balance as well, so this is the
-- same lesson applied before it can be paid for a second time.
--
-- ## Backup 6 -> 7, in this same migration, because it cannot be deferred
--
-- Four new owner tables, so the export must carry them or it silently stops covering every owner
-- table and `SPEC.md` gate 6 is broken the afternoon they exist. v2 … v6 all stay restorable
-- forever, for the reason that has not weakened once: a version that stops being restorable strands
-- whatever the owner took under it. New tables and no new columns, which is D-097's rule.

begin;

-- ------------------------------------------------------- the correction overlay

create table public.notification_card_correction_overlays (
  card_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  -- Null in every corrected column means *not corrected*, and there is no ambiguity about
  -- clearing a value to null: none of these is nullable on the card itself except `counterparty`,
  -- `category_id` and `note`, which behave exactly as the slip overlay's do.
  kind text check (kind is null or kind in ('deposit','withdrawal')),
  amount_minor bigint,
  -- The one column `slip_correction_overlays` has no counterpart for. A slip prints no balance, so
  -- there was never a second figure to correct; a card prints one and reconciles on it, which makes
  -- a mistyped balance exactly as consequential as a mistyped amount.
  balance_minor bigint,
  occurred_on date,
  occurred_at_time time,
  counterparty text check (counterparty is null or length(btrim(counterparty)) between 1 and 240),
  category_id uuid,
  note text check (note is null or length(note) <= 2000),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (card_id, owner_id) references public.notification_cards(id, owner_id),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  -- Direction and amount move together or neither moves: a corrected amount whose sign contradicts
  -- an uncorrected direction would be a row this ledger cannot interpret.
  check ((kind is null) = (amount_minor is null)),
  check (amount_minor is null
      or (kind = 'deposit' and amount_minor > 0)
      or (kind = 'withdrawal' and amount_minor < 0)),
  -- **No sign check on the balance, deliberately.** A balance is a position rather than a movement:
  -- zero is ordinary and a negative one is an overdraft rather than a mistake. `lib/notification-cards.ts`
  -- already makes this argument for the captured value; the corrected one is held to the same rule.
  unique (card_id, owner_id)
);

create table public.notification_card_correction_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  card_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  foreign key (card_id, owner_id) references public.notification_cards(id, owner_id),
  unique (card_id, revision),
  unique (id, owner_id)
);

create index notification_card_correction_revisions_owner_card
  on public.notification_card_correction_revisions(owner_id, card_id);

create trigger notification_card_correction_revisions_immutable
  before update or delete on public.notification_card_correction_revisions
  for each row execute function private.reject_change();

-- --------------------------------------------------------- the decision overlay

create table public.notification_card_decision_overlays (
  card_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  -- Three values where a slip has two. `not-a-payment` is the retirement, and it lives here rather
  -- than in a table of its own so that one row answers what this card's relationship to the ledger
  -- is. See the header for why retiring is the remedy for a wrong binding rather than re-binding.
  decision text not null check (decision in ('matched','unmatched','not-a-payment')),
  transaction_id uuid,
  -- The owner's acknowledgement that the card's balance and the row's disagree, recorded at the
  -- moment the decision was made. **Not a computed comparison**: re-deriving it at read time would
  -- change its answer the moment the balance is corrected, and this is a fact about a decision.
  accepted_balance_mismatch boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (card_id, owner_id) references public.notification_cards(id, owner_id),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  -- A transaction is named by exactly one of the three decisions, and the other two name none.
  check ((decision = 'matched') = (transaction_id is not null)),
  -- Accepting a mismatch is meaningless without a row to disagree with.
  check (accepted_balance_mismatch = false or decision = 'matched'),
  unique (card_id, owner_id)
);

-- **Its own index, not the slip one.** A statement row may carry a slip and a card at once, because
-- one payment can produce both records (D-102). What this refuses is two *cards* claiming one row.
create unique index notification_card_decision_one_claim_per_transaction
  on public.notification_card_decision_overlays(transaction_id, owner_id)
  where transaction_id is not null;

create table public.notification_card_decision_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  card_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  foreign key (card_id, owner_id) references public.notification_cards(id, owner_id),
  unique (card_id, revision),
  unique (id, owner_id)
);

create index notification_card_decision_revisions_owner_card
  on public.notification_card_decision_revisions(owner_id, card_id);

create trigger notification_card_decision_revisions_immutable
  before update or delete on public.notification_card_decision_revisions
  for each row execute function private.reject_change();

-- ------------------------------------------------------------- least privilege

alter table public.notification_card_correction_overlays enable row level security;
alter table public.notification_card_correction_overlays force row level security;
create policy strong_owner_select on public.notification_card_correction_overlays for select to authenticated
  using (private.has_strong_owner_access(owner_id));

alter table public.notification_card_correction_revisions enable row level security;
alter table public.notification_card_correction_revisions force row level security;
create policy strong_owner_select on public.notification_card_correction_revisions for select to authenticated
  using (private.has_strong_owner_access(owner_id));

alter table public.notification_card_decision_overlays enable row level security;
alter table public.notification_card_decision_overlays force row level security;
create policy strong_owner_select on public.notification_card_decision_overlays for select to authenticated
  using (private.has_strong_owner_access(owner_id));

alter table public.notification_card_decision_revisions enable row level security;
alter table public.notification_card_decision_revisions force row level security;
create policy strong_owner_select on public.notification_card_decision_revisions for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.notification_card_correction_overlays to authenticated;
grant select on public.notification_card_correction_revisions to authenticated;
grant select on public.notification_card_decision_overlays to authenticated;
grant select on public.notification_card_decision_revisions to authenticated;

-- The only write paths are the two RPCs below. Stated rather than assumed, matching migrations 010
-- to 016: a future blanket grant must not quietly open a way around them.
revoke insert, update, delete on public.notification_card_correction_overlays from authenticated, anon;
revoke insert, update, delete on public.notification_card_correction_revisions from authenticated, anon;
revoke insert, update, delete on public.notification_card_decision_overlays from authenticated, anon;
revoke insert, update, delete on public.notification_card_decision_revisions from authenticated, anon;

-- ------------------------------------------------------------ correcting a card

/*
 * Correcting what the owner typed off a card.
 *
 * Modelled on `set_slip_correction`, with two additions a card forces:
 *
 *   * the **balance** is correctable, and is validated as canonical int64 text exactly as the
 *     amount is — it is money, it is stored, it is exported, and the reconciliation reads it; and
 *   * a stored `matched` decision is re-checked against **both** figures rather than one. Clearing
 *     a correction can break a pairing exactly as setting one can, which is why the check runs on
 *     the figure that would be in force rather than on the argument.
 *
 * The balance half of that check respects the owner's stored consent: a pairing made with
 * `accepted_balance_mismatch` already true is not re-refused for the disagreement it was made in
 * spite of.
 */
create or replace function public.set_notification_card_correction(
  p_card_id uuid, p_expected_revision integer, p_kind text, p_amount_minor text,
  p_balance_minor text, p_occurred_on date, p_occurred_at_time time,
  p_counterparty text, p_category_id uuid, p_note text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_card public.notification_cards%rowtype;
  v_amount bigint;
  v_balance bigint;
  v_effective_amount bigint;
  v_effective_balance bigint;
  v_revision integer;
  v_snapshot jsonb;
  v_decision public.notification_card_decision_overlays%rowtype;
  v_movement bigint;
  v_row_balance bigint;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if (p_kind is null) <> (p_amount_minor is null) then
    raise exception 'notification card correction amount and kind move together';
  end if;
  if p_amount_minor is not null then
    if p_kind not in ('deposit','withdrawal') then raise exception 'invalid notification card kind'; end if;
    if not private.is_canonical_int64_text(p_amount_minor) then
      raise exception 'notification card amount must be canonical int64 text';
    end if;
    v_amount := p_amount_minor::bigint;
    if (p_kind = 'deposit') <> (v_amount > 0) then
      raise exception 'notification card amount sign does not match its kind';
    end if;
  end if;
  if p_balance_minor is not null then
    if not private.is_canonical_int64_text(p_balance_minor) then
      raise exception 'notification card balance must be canonical int64 text';
    end if;
    v_balance := p_balance_minor::bigint;
  end if;

  select * into v_card from public.notification_cards where id = p_card_id and owner_id = v_owner;
  if v_card.id is null then raise exception 'notification card not owned'; end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and owner_id = v_owner
  ) then raise exception 'category not owned'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  -- The figures that would be in force after this correction: the corrected ones where given,
  -- otherwise the card's own.
  v_effective_amount := coalesce(v_amount, v_card.amount_minor);
  v_effective_balance := coalesce(v_balance, v_card.balance_minor);

  select * into v_decision from public.notification_card_decision_overlays
    where card_id = p_card_id and owner_id = v_owner;
  if v_decision.decision = 'matched' then
    select sum(c.amount_minor) into v_movement from public.source_components c
      where c.transaction_id = v_decision.transaction_id and c.owner_id = v_owner;
    select t.post_balance_minor into v_row_balance from public.source_transactions t
      where t.id = v_decision.transaction_id and t.owner_id = v_owner;
    if v_movement is distinct from v_effective_amount then
      raise exception 'notification card correction conflicts with stored match';
    end if;
    -- Only when the owner did **not** already accept a disagreement. Re-refusing a pairing he made
    -- in spite of one would make his own consent unrepeatable.
    if v_decision.accepted_balance_mismatch = false and v_row_balance is distinct from v_effective_balance then
      raise exception 'notification card correction contradicts the matched row balance';
    end if;
  end if;

  select revision into v_revision from public.notification_card_correction_overlays
    where card_id = p_card_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'notification card correction revision conflict'; end if;
  v_revision := v_revision + 1;

  insert into public.notification_card_correction_overlays(card_id, owner_id, kind, amount_minor,
      balance_minor, occurred_on, occurred_at_time, counterparty, category_id, note, revision)
    values (p_card_id, v_owner, p_kind, v_amount, v_balance, p_occurred_on, p_occurred_at_time,
      nullif(btrim(coalesce(p_counterparty,'')),''), p_category_id, nullif(btrim(coalesce(p_note,'')),''), v_revision)
  on conflict (card_id) do update set kind = excluded.kind, amount_minor = excluded.amount_minor,
    balance_minor = excluded.balance_minor, occurred_on = excluded.occurred_on,
    occurred_at_time = excluded.occurred_at_time, counterparty = excluded.counterparty,
    category_id = excluded.category_id, note = excluded.note,
    revision = excluded.revision, updated_at = now();

  select to_jsonb(o) into v_snapshot from public.notification_card_correction_overlays o
    where o.card_id = p_card_id and o.owner_id = v_owner;
  insert into public.notification_card_correction_revisions(owner_id, card_id, revision, snapshot, changed_by)
    values (v_owner, p_card_id, v_revision, v_snapshot, v_owner);
  -- Structure, never values: which figures were corrected, not what to.
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'notification_card.corrected', 'notification_card', p_card_id,
      jsonb_build_object('revision', v_revision,
        'amount_corrected', p_amount_minor is not null,
        'balance_corrected', p_balance_minor is not null));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_snapshot;
end;
$$;
revoke all on function public.set_notification_card_correction(uuid,integer,text,text,text,date,time,text,uuid,text)
  from public, anon;
grant execute on function public.set_notification_card_correction(uuid,integer,text,text,text,date,time,text,uuid,text)
  to authenticated;

-- ------------------------------------------------------------- deciding a card

/*
 * The owner's say over one card: which statement row it is, that it is on none of them, or that it
 * should never have been captured at all.
 *
 * Modelled on `set_slip_match`. Three differences, each following from what a card carries that a
 * slip does not:
 *
 *   * it re-checks the **account** rather than the bank, because the card was bound to one at
 *     capture and that binding was checked against the printed digits (D-101);
 *   * it compares the **balance** and refuses unless the caller acknowledges a disagreement,
 *     storing that acknowledgement; and
 *   * `not-a-payment` retires the card, which no slip decision has an equivalent of.
 *
 * Both figures come from the correction overlay where one exists, for migration 014's reason.
 */
create or replace function public.set_notification_card_decision(
  p_card_id uuid, p_expected_revision integer, p_decision text,
  p_transaction_id uuid, p_accept_balance_mismatch boolean
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_card public.notification_cards%rowtype;
  v_effective_amount bigint;
  v_effective_balance bigint;
  v_revision integer;
  v_snapshot jsonb;
  v_account uuid;
  v_movement bigint;
  v_row_balance bigint;
  v_accepted boolean := false;
  v_accept boolean := coalesce(p_accept_balance_mismatch, false);
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_decision not in ('matched','unmatched','not-a-payment') then
    raise exception 'invalid notification card decision';
  end if;
  if (p_decision = 'matched') <> (p_transaction_id is not null) then
    raise exception 'invalid notification card decision';
  end if;

  select * into v_card from public.notification_cards where id = p_card_id and owner_id = v_owner;
  if v_card.id is null then raise exception 'notification card not owned'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select coalesce(o.amount_minor, v_card.amount_minor), coalesce(o.balance_minor, v_card.balance_minor)
    into v_effective_amount, v_effective_balance
    from (select 1) _
    left join public.notification_card_correction_overlays o
      on o.card_id = p_card_id and o.owner_id = v_owner;

  if p_decision = 'matched' then
    -- The same facts the automatic rule matches on, re-checked here because a client is not a
    -- place to enforce an invariant about money.
    select t.account_id, t.post_balance_minor,
           (select sum(c.amount_minor) from public.source_components c
             where c.transaction_id = t.id and c.owner_id = v_owner)
      into v_account, v_row_balance, v_movement
      from public.source_transactions t
     where t.id = p_transaction_id and t.owner_id = v_owner;
    if v_account is null then raise exception 'transaction not owned'; end if;
    -- The account, not the bank. This is the check a slip cannot make.
    if v_account is distinct from v_card.account_id then
      raise exception 'notification card match account mismatch';
    end if;
    if v_movement is distinct from v_effective_amount then
      raise exception 'notification card match amount mismatch';
    end if;
    -- Fail-closed by default, exactly as the automatic rule is (D-102). The refusal lifts only on
    -- an explicit acknowledgement, and the acknowledgement is then what gets stored.
    if v_row_balance is distinct from v_effective_balance then
      if not v_accept then raise exception 'notification card match balance mismatch'; end if;
      v_accepted := true;
    end if;
  end if;

  select revision into v_revision from public.notification_card_decision_overlays
    where card_id = p_card_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'notification card decision revision conflict'; end if;
  v_revision := v_revision + 1;

  begin
    insert into public.notification_card_decision_overlays(card_id, owner_id, decision, transaction_id,
        accepted_balance_mismatch, revision)
      values (p_card_id, v_owner, p_decision, p_transaction_id, v_accepted, v_revision)
    on conflict (card_id) do update set decision = excluded.decision,
      transaction_id = excluded.transaction_id,
      accepted_balance_mismatch = excluded.accepted_balance_mismatch,
      revision = excluded.revision, updated_at = now();
  exception when unique_violation then
    -- The partial index above. Another **card** already claims that row; a slip claiming it is not
    -- a conflict and is not refused here.
    raise exception 'statement row already claimed by another notification card';
  end;

  select to_jsonb(o) into v_snapshot from public.notification_card_decision_overlays o
    where o.card_id = p_card_id and o.owner_id = v_owner;
  insert into public.notification_card_decision_revisions(owner_id, card_id, revision, snapshot, changed_by)
    values (v_owner, p_card_id, v_revision, v_snapshot, v_owner);
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'notification_card.decision.' || p_decision, 'notification_card', p_card_id,
      jsonb_build_object('revision', v_revision, 'decision', p_decision,
        'accepted_balance_mismatch', v_accepted));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_snapshot;
end;
$$;
revoke all on function public.set_notification_card_decision(uuid,integer,text,uuid,boolean) from public, anon;
grant execute on function public.set_notification_card_decision(uuid,integer,text,uuid,boolean) to authenticated;

-- ------------------------------------------------------------- backup 6 -> 7

alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3,4,5,6,7));

alter table public.restore_chunks
  drop constraint if exists restore_chunks_v2_binding,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions',
        'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
        'mutation_sequences','slips','slip_match_overlays','slip_match_revisions',
        'cash_entries','cash_entry_overlays','cash_entry_revisions',
        'slip_correction_overlays','slip_correction_revisions','notification_cards',
        'notification_card_correction_overlays','notification_card_correction_revisions',
        'notification_card_decision_overlays','notification_card_decision_revisions')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

-- Appended, never slotted in: the manifest binds a chunk to its index, so reordering would
-- invalidate every existing descriptor in a way no digest could distinguish from tampering.
-- Indices 0..19 keep meaning exactly what they meant in v6.
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
    'notification_cards',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'-'balance_minor'
      ||jsonb_build_object('amount_minor',amount_minor::text,'balance_minor',balance_minor::text) order by id),'[]')
      from public.notification_cards x where owner_id=v_owner),
    -- Both corrected figures are nullable, so each is stringified only when present — the same
    -- shape `cash_entry_overlays` and `slip_correction_overlays` use, applied twice because a card
    -- has two money columns to correct rather than one.
    'notification_card_correction_overlays',(select coalesce(jsonb_agg(
      to_jsonb(x)-'amount_minor'-'balance_minor'
        ||case when amount_minor is null then jsonb_build_object('amount_minor',null) else jsonb_build_object('amount_minor',amount_minor::text) end
        ||case when balance_minor is null then jsonb_build_object('balance_minor',null) else jsonb_build_object('balance_minor',balance_minor::text) end
      order by card_id),'[]') from public.notification_card_correction_overlays x where owner_id=v_owner),
    'notification_card_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_correction_revisions x where owner_id=v_owner),
    'notification_card_decision_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id),'[]') from public.notification_card_decision_overlays x where owner_id=v_owner),
    'notification_card_decision_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_decision_revisions x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',7,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

-- The kind list is built up by version, so an eighth version adds one line and strands nothing.
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
 if v_schema_text not in ('2','3','4','5','6','7') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 v_schema:=v_schema_text::integer;
 v_expected_kinds:=v_base_kinds;
 if v_schema>=3 then v_expected_kinds:=v_expected_kinds||array['slips']; end if;
 if v_schema>=4 then v_expected_kinds:=v_expected_kinds||array['slip_match_overlays','slip_match_revisions']; end if;
 if v_schema>=5 then v_expected_kinds:=v_expected_kinds||array['cash_entries','cash_entry_overlays','cash_entry_revisions','slip_correction_overlays','slip_correction_revisions']; end if;
 if v_schema>=6 then v_expected_kinds:=v_expected_kinds||array['notification_cards']; end if;
 if v_schema>=7 then v_expected_kinds:=v_expected_kinds||array['notification_card_correction_overlays','notification_card_correction_revisions','notification_card_decision_overlays','notification_card_decision_revisions']; end if;
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
    or exists(select 1 from public.notification_cards where owner_id=v_owner)
    -- The four new ones, for the reason every table above is listed: the question is whether this
    -- ledger already holds anything, not whether the payload has an opinion.
    or exists(select 1 from public.notification_card_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_correction_revisions where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_revisions where owner_id=v_owner)
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
    when 'notification_card_correction_overlays' then
     -- Two nullable money columns rather than one. Each is checked only when present, for the
     -- reason the cash and slip overlays give: an absent corrected figure means the original
     -- stands, and holding null to a canonical-text rule would refuse every partial correction.
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore notification card correction money must be canonical int64 text'; end if;
     end if;
     if v_row->'balance_minor' is not null and jsonb_typeof(v_row->'balance_minor') <> 'null' then
      if jsonb_typeof(v_row->'balance_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'balance_minor')
        then raise exception 'restore notification card correction money must be canonical int64 text'; end if;
     end if;
     insert into public.notification_card_correction_overlays(card_id,owner_id,kind,amount_minor,balance_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'card_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'balance_minor','')::bigint,
        nullif(v_row->>'occurred_on','')::date,nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',
        nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'notification_card_correction_revisions' then insert into public.notification_card_correction_revisions(id,owner_id,card_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'card_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
   when 'notification_card_decision_overlays' then insert into public.notification_card_decision_overlays(card_id,owner_id,decision,transaction_id,accepted_balance_mismatch,revision,updated_at)
    values((v_row->>'card_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'accepted_balance_mismatch')::boolean,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'notification_card_decision_revisions' then insert into public.notification_card_decision_revisions(id,owner_id,card_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'card_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
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

-- Migration 055 — Shopee orders: storage, capture, the owner's match to the ledger, and the
-- wallet / SPayLater / refund links (PLAN task 62 step 2, D-270). Backup v16 is appended at the end of this
-- migration.
--
-- ## An order is never money
--
-- As for a 7-Eleven receipt (027) and a GrabFood order (032), the payment is already a ledger row.
-- An order itemizes it and nothing here writes `source_transactions`, an overlay of one, or a
-- total. A match or a link moves no balance.
--
-- ## Append-only, and a second copy is a no-op
--
-- An order is keyed by `(owner_id, order_code)`. A second copy whose `facts_digest` agrees writes
-- nothing; a second copy whose facts differ is refused, because two readings of one order must
-- agree and keeping either would launder a misread (027's Rule 2). The digest covers the order
-- code, the link id, both timestamps (as UTC), the shop, the printed payment method, the total
-- and every price line in position order. Items are display only: they are not in the digest, they
-- carry no sum check, and a second copy never adds to or replaces them. A refund is keyed by
-- `(owner_id, request_id)` and compared field by field. All of the order tables reject update and
-- delete. Only the match overlay is mutable, through `set_shopee_payment_match`.
--
-- ## The arithmetic is checked here too
--
-- The price lines (signed: a voucher or a shipping discount prints negative) must sum exactly to
-- the total, re-derived server side for the reason `capture_slip` re-checks money. The payment
-- kind is derived from the printed payment method by `private.shopee_payment_kind` and never
-- taken from the caller.
--
-- ## One bad order does not sink the batch
--
-- `capture_shopee_orders` takes up to 1000 orders and handles each in its own sub-transaction. A
-- refused order is reported as `{orderCode, reason}` with a reason fixed in this function, never
-- the database's own message (which can quote a caller's value). A refused refund leaves its
-- order's outcome standing and is reported separately. An order dated before the owner's earliest
-- ledger row is skipped and counted `beforeLedger`.
--
-- ## Many orders, one transaction
--
-- Shopee can bill several orders in one bank debit. So unlike migrations 030 and 033 there is no
-- one-claim-per-row index: the overlay is per order, and `set_shopee_payment_match` takes the
-- whole group at once and requires the group's totals to equal the row's movement exactly, and
-- the group to be exactly the set of orders claiming that row. A combined checkout is undone
-- whole.
--
-- ## Links are an event log
--
-- A wallet top-up, a SPayLater repayment and a refund deposit are other ledger rows an order
-- relates to. `shopee_order_links` is append-only; the current state of an
-- (order, transaction, kind) is its newest event. Setting a state it already has appends nothing.
--
-- ## What is never stored
--
-- The recipient name, address and phone, and the printed refund destination: there is no column
-- for any of them.

begin;

create or replace function private.shopee_payment_kind(p_method text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select case
    when p_method is null then 'other'
    when position('ตัดบัญชี' in p_method) > 0 then 'bank_debit'
    when p_method = 'ShopeePay' then 'wallet'
    when p_method = 'SPayLater' then 'spaylater'
    else 'other'
  end
$$;
revoke all on function private.shopee_payment_kind(text) from public, anon, authenticated;

create table public.shopee_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  order_code text not null check (order_code ~ '^[0-9A-Z]{10,20}$'),
  -- The number in the order's own URL.
  link_id text not null check (link_id ~ '^[0-9]{10,20}$'),
  placed_at timestamptz not null,
  paid_at timestamptz null,
  shop text not null check (shop <> ''),
  -- The printed string, kept as read.
  payment_method text not null check (payment_method <> ''),
  payment_kind text not null check (payment_kind in ('bank_debit','wallet','spaylater','other')),
  total_minor bigint not null check (total_minor >= 0),
  item_price_is text null check (item_price_is in ('line total','unit price')),
  facts_digest text not null check (facts_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (owner_id, order_code),
  unique (id, owner_id)
);

create index shopee_orders_owner_date on public.shopee_orders(owner_id, (coalesce(paid_at, placed_at)));

create table public.shopee_order_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  order_id uuid not null,
  position integer not null check (position > 0),
  name text not null check (name <> ''),
  variation text null,
  quantity integer not null check (quantity > 0),
  -- Null for a gift line that prints no price.
  price_minor bigint null check (price_minor is null or price_minor >= 0),
  original_price_minor bigint null check (original_price_minor >= 0),
  foreign key (order_id, owner_id) references public.shopee_orders(id, owner_id),
  unique (order_id, position)
);

-- Every line that makes up the total, in print order. Signed: a discount or a voucher is negative.
create table public.shopee_order_price_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  order_id uuid not null,
  position integer not null check (position > 0),
  label text not null check (label <> ''),
  amount_minor bigint not null,
  foreign key (order_id, owner_id) references public.shopee_orders(id, owner_id),
  unique (order_id, position)
);

create table public.shopee_refunds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  order_id uuid not null,
  request_id text not null check (request_id ~ '^[0-9A-Z]{10,20}$'),
  requested_at timestamptz not null,
  refund_minor bigint not null check (refund_minor > 0),
  refund_to text not null check (refund_to in ('wallet','bank')),
  requested_by text not null check (requested_by in ('buyer','shopee')),
  reason text null,
  steps text[] not null check (steps <@ array['Cancellation Requested','Cancellation Accepted','Refunded','Refund Completed']::text[]),
  created_at timestamptz not null default now(),
  foreign key (order_id, owner_id) references public.shopee_orders(id, owner_id),
  unique (owner_id, request_id),
  unique (id, owner_id)
);

create index shopee_refunds_owner_order on public.shopee_refunds(owner_id, order_id);

create table public.shopee_payment_match_overlays (
  order_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  decision text not null check (decision in ('matched','unmatched')),
  transaction_id uuid,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (order_id, owner_id) references public.shopee_orders(id, owner_id),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  check ((decision = 'matched' and transaction_id is not null)
      or (decision = 'unmatched' and transaction_id is null)),
  unique (order_id, owner_id)
);

-- Deliberately no unique index on the transaction: several orders may share one bank debit.
create index shopee_payment_match_overlays_owner_tx
  on public.shopee_payment_match_overlays(owner_id, transaction_id) where transaction_id is not null;

create table public.shopee_payment_match_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  order_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  foreign key (order_id, owner_id) references public.shopee_orders(id, owner_id),
  unique (order_id, revision),
  unique (id, owner_id)
);

create index shopee_payment_match_revisions_owner_order
  on public.shopee_payment_match_revisions(owner_id, order_id);

-- `changed_at` defaults to `clock_timestamp()`, not `now()`: the newest event decides the current
-- state, and two calls in one transaction must still order.
create table public.shopee_order_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  order_id uuid not null,
  transaction_id uuid not null,
  kind text not null check (kind in ('wallet_topup','spaylater_repayment','refund_deposit')),
  action text not null check (action in ('link','unlink')),
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid not null references auth.users(id),
  foreign key (order_id, owner_id) references public.shopee_orders(id, owner_id),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  unique (id, owner_id)
);

create index shopee_order_links_owner_tx on public.shopee_order_links(owner_id, transaction_id);
create index shopee_order_links_owner_order on public.shopee_order_links(owner_id, order_id);

create trigger shopee_orders_immutable before update or delete on public.shopee_orders
  for each row execute function private.reject_change();
create trigger shopee_order_items_immutable before update or delete on public.shopee_order_items
  for each row execute function private.reject_change();
create trigger shopee_order_price_lines_immutable before update or delete on public.shopee_order_price_lines
  for each row execute function private.reject_change();
create trigger shopee_refunds_immutable before update or delete on public.shopee_refunds
  for each row execute function private.reject_change();
create trigger shopee_payment_match_revisions_immutable before update or delete on public.shopee_payment_match_revisions
  for each row execute function private.reject_change();
create trigger shopee_order_links_immutable before update or delete on public.shopee_order_links
  for each row execute function private.reject_change();

alter table public.shopee_orders enable row level security;
alter table public.shopee_orders force row level security;
alter table public.shopee_order_items enable row level security;
alter table public.shopee_order_items force row level security;
alter table public.shopee_order_price_lines enable row level security;
alter table public.shopee_order_price_lines force row level security;
alter table public.shopee_refunds enable row level security;
alter table public.shopee_refunds force row level security;
alter table public.shopee_payment_match_overlays enable row level security;
alter table public.shopee_payment_match_overlays force row level security;
alter table public.shopee_payment_match_revisions enable row level security;
alter table public.shopee_payment_match_revisions force row level security;
alter table public.shopee_order_links enable row level security;
alter table public.shopee_order_links force row level security;

create policy strong_owner_select on public.shopee_orders for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.shopee_order_items for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.shopee_order_price_lines for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.shopee_refunds for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.shopee_payment_match_overlays for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.shopee_payment_match_revisions for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.shopee_order_links for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.shopee_orders, public.shopee_order_items, public.shopee_order_price_lines,
  public.shopee_refunds, public.shopee_payment_match_overlays, public.shopee_payment_match_revisions,
  public.shopee_order_links to authenticated;
-- The only write paths are the three functions below.
revoke insert, update, delete on public.shopee_orders, public.shopee_order_items,
  public.shopee_order_price_lines, public.shopee_refunds, public.shopee_payment_match_overlays,
  public.shopee_payment_match_revisions, public.shopee_order_links from authenticated, anon;

/*
 * The single write path for orders and refunds. See the header for the rules. Money crosses the
 * wire as canonical int64 text: non-negative everywhere except a price line, which is signed.
 */
create or replace function public.capture_shopee_orders(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_order jsonb;
  v_item jsonb;
  v_line jsonb;
  v_refund jsonb;
  v_earliest date;
  v_new integer := 0;
  v_stored integer := 0;
  v_before integer := 0;
  v_refunds_new integer := 0;
  v_refunds_stored integer := 0;
  v_refused jsonb := '[]'::jsonb;
  v_code text;
  v_reason text;
  v_skip boolean;
  v_order_id uuid;
  v_placed timestamptz;
  v_paid timestamptz;
  v_total bigint;
  v_sum bigint;
  v_digest text;
  v_lines jsonb;
  v_existing public.shopee_orders%rowtype;
  v_refund_row public.shopee_refunds%rowtype;
  v_req_at timestamptz;
  v_refund_minor bigint;
  v_known text[] := array[
    'price lines do not sum to the total',
    'differs from the stored order',
    'refund differs from the stored refund',
    'refund exceeds the order total'];
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if jsonb_typeof(p_request) is distinct from 'object'
    or jsonb_typeof(p_request->'orders') is distinct from 'array'
    or jsonb_array_length(p_request->'orders') not between 1 and 1000
    then raise exception 'invalid shopee capture'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select min(source_date) into v_earliest from public.source_transactions where owner_id = v_owner;

  for v_order in select value from jsonb_array_elements(p_request->'orders') loop
    v_code := case when jsonb_typeof(v_order->'orderCode') = 'string' and v_order->>'orderCode' ~ '^[0-9A-Z]{10,20}$'
      then v_order->>'orderCode' end;
    v_skip := false;
    v_order_id := null;

    begin
      if jsonb_typeof(v_order) is distinct from 'object'
        or v_code is null
        or jsonb_typeof(v_order->'linkId') is distinct from 'string' or v_order->>'linkId' !~ '^[0-9]{10,20}$'
        or jsonb_typeof(v_order->'placedAt') is distinct from 'string'
        or v_order->>'placedAt' !~ '(Z|[+-][0-9]{2}:?[0-9]{2})$'
        or jsonb_typeof(v_order->'paidAt') not in ('string', 'null')
        or (jsonb_typeof(v_order->'paidAt') = 'string' and v_order->>'paidAt' !~ '(Z|[+-][0-9]{2}:?[0-9]{2})$')
        or jsonb_typeof(v_order->'shop') is distinct from 'string' or v_order->>'shop' = ''
        or jsonb_typeof(v_order->'paymentMethod') is distinct from 'string' or v_order->>'paymentMethod' = ''
        or jsonb_typeof(v_order->'totalMinor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_order->>'totalMinor', true)
        or jsonb_typeof(v_order->'itemPriceIs') not in ('string', 'null')
        or (jsonb_typeof(v_order->'itemPriceIs') = 'string' and v_order->>'itemPriceIs' not in ('line total', 'unit price'))
        or jsonb_typeof(v_order->'items') is distinct from 'array'
        or jsonb_typeof(v_order->'priceLines') is distinct from 'array'
        or jsonb_typeof(coalesce(v_order->'refund', 'null'::jsonb)) not in ('object', 'null')
        then raise exception 'invalid order'; end if;

      v_placed := (v_order->>'placedAt')::timestamptz;
      v_paid := nullif(v_order->>'paidAt', '')::timestamptz;
      v_total := (v_order->>'totalMinor')::bigint;

      v_sum := 0;
      for v_line in select value from jsonb_array_elements(v_order->'priceLines') loop
        if jsonb_typeof(v_line) is distinct from 'object'
          or jsonb_typeof(v_line->'label') is distinct from 'string'
          or jsonb_typeof(v_line->'position') is distinct from 'number'
          or jsonb_typeof(v_line->'amountMinor') is distinct from 'string'
          or not private.is_canonical_int64_text(v_line->>'amountMinor')
          then raise exception 'invalid order'; end if;
        v_sum := v_sum + (v_line->>'amountMinor')::bigint;
      end loop;
      for v_item in select value from jsonb_array_elements(v_order->'items') loop
        if jsonb_typeof(v_item) is distinct from 'object'
          or jsonb_typeof(v_item->'name') is distinct from 'string'
          or jsonb_typeof(v_item->'position') is distinct from 'number'
          or jsonb_typeof(v_item->'quantity') is distinct from 'number'
          or jsonb_typeof(v_item->'variation') not in ('string', 'null')
          or jsonb_typeof(v_item->'priceMinor') not in ('string', 'null')
          or (jsonb_typeof(v_item->'priceMinor') = 'string'
              and not private.is_canonical_int64_text(v_item->>'priceMinor', true))
          or jsonb_typeof(v_item->'originalPriceMinor') not in ('string', 'null')
          or (jsonb_typeof(v_item->'originalPriceMinor') = 'string'
              and not private.is_canonical_int64_text(v_item->>'originalPriceMinor', true))
          then raise exception 'invalid order'; end if;
      end loop;
      if v_sum <> v_total then raise exception 'price lines do not sum to the total'; end if;

      if v_earliest is null
        or (coalesce(v_paid, v_placed) at time zone 'Asia/Bangkok')::date < v_earliest then
        v_skip := true;
        v_before := v_before + 1;
      else
        select coalesce(jsonb_agg(jsonb_build_array(l.value->>'label', l.value->>'amountMinor')
                 order by (l.value->>'position')::integer), '[]'::jsonb)
          into v_lines from jsonb_array_elements(v_order->'priceLines') l;
        v_digest := private.sha256_jsonb(jsonb_build_object(
          'orderCode', v_code,
          'linkId', v_order->>'linkId',
          'placedAt', to_char(v_placed at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'paidAt', case when v_paid is null then null
            else to_char(v_paid at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
          'shop', v_order->>'shop',
          'paymentMethod', v_order->>'paymentMethod',
          'totalMinor', v_total::text,
          'priceLines', v_lines));

        select * into v_existing from public.shopee_orders where owner_id = v_owner and order_code = v_code;
        if v_existing.id is not null then
          if v_existing.facts_digest <> v_digest then raise exception 'differs from the stored order'; end if;
          v_order_id := v_existing.id;
          v_stored := v_stored + 1;
        else
          insert into public.shopee_orders(owner_id, order_code, link_id, placed_at, paid_at, shop,
            payment_method, payment_kind, total_minor, item_price_is, facts_digest)
          values (v_owner, v_code, v_order->>'linkId', v_placed, v_paid, v_order->>'shop',
            v_order->>'paymentMethod', private.shopee_payment_kind(v_order->>'paymentMethod'), v_total,
            nullif(v_order->>'itemPriceIs', ''), v_digest)
          returning id into v_order_id;

          for v_item in select value from jsonb_array_elements(v_order->'items') loop
            insert into public.shopee_order_items(owner_id, order_id, position, name, variation, quantity,
              price_minor, original_price_minor)
            values (v_owner, v_order_id, (v_item->>'position')::integer, v_item->>'name',
              nullif(v_item->>'variation', ''), (v_item->>'quantity')::integer,
              nullif(v_item->>'priceMinor', '')::bigint, nullif(v_item->>'originalPriceMinor', '')::bigint);
          end loop;
          for v_line in select value from jsonb_array_elements(v_order->'priceLines') loop
            insert into public.shopee_order_price_lines(owner_id, order_id, position, label, amount_minor)
            values (v_owner, v_order_id, (v_line->>'position')::integer, v_line->>'label',
              (v_line->>'amountMinor')::bigint);
          end loop;
          v_new := v_new + 1;
        end if;
      end if;
    exception when others then
      -- Only a reason fixed in this function is reported; anything else (a CHECK, a cast) is
      -- "invalid order", because the database's own message can quote the caller's value.
      v_reason := case when sqlerrm = any (v_known) then sqlerrm else 'invalid order' end;
      v_refused := v_refused || jsonb_build_array(jsonb_build_object('orderCode', v_code, 'reason', v_reason));
      v_skip := true;
      v_order_id := null;
    end;

    v_refund := v_order->'refund';
    if not v_skip and v_order_id is not null and jsonb_typeof(v_refund) = 'object' then
      begin
        if jsonb_typeof(v_refund->'requestId') is distinct from 'string'
          or v_refund->>'requestId' !~ '^[0-9A-Z]{10,20}$'
          or jsonb_typeof(v_refund->'requestedAt') is distinct from 'string'
          or v_refund->>'requestedAt' !~ '(Z|[+-][0-9]{2}:?[0-9]{2})$'
          or jsonb_typeof(v_refund->'refundMinor') is distinct from 'string'
          or not private.is_canonical_int64_text(v_refund->>'refundMinor', true)
          or jsonb_typeof(v_refund->'refundTo') is distinct from 'string'
          or v_refund->>'refundTo' not in ('wallet', 'bank')
          or jsonb_typeof(v_refund->'requestedBy') is distinct from 'string'
          or v_refund->>'requestedBy' not in ('buyer', 'shopee')
          or jsonb_typeof(v_refund->'reason') not in ('string', 'null')
          or jsonb_typeof(v_refund->'steps') is distinct from 'array'
          or exists (select 1 from jsonb_array_elements(v_refund->'steps') s
                      where jsonb_typeof(s.value) is distinct from 'string')
          then raise exception 'invalid order'; end if;
        v_req_at := (v_refund->>'requestedAt')::timestamptz;
        v_refund_minor := (v_refund->>'refundMinor')::bigint;
        if v_refund_minor > v_total then raise exception 'refund exceeds the order total'; end if;

        select * into v_refund_row from public.shopee_refunds
          where owner_id = v_owner and request_id = v_refund->>'requestId';
        if v_refund_row.id is not null then
          if v_refund_row.order_id <> v_order_id
            or v_refund_row.requested_at <> v_req_at
            or v_refund_row.refund_minor <> v_refund_minor
            or v_refund_row.refund_to <> v_refund->>'refundTo'
            or v_refund_row.requested_by <> v_refund->>'requestedBy'
            then raise exception 'refund differs from the stored refund'; end if;
          v_refunds_stored := v_refunds_stored + 1;
        else
          insert into public.shopee_refunds(owner_id, order_id, request_id, requested_at, refund_minor,
            refund_to, requested_by, reason, steps)
          values (v_owner, v_order_id, v_refund->>'requestId', v_req_at, v_refund_minor,
            v_refund->>'refundTo', v_refund->>'requestedBy', nullif(v_refund->>'reason', ''),
            (select coalesce(array_agg(s.value #>> '{}' order by s.ordinality), '{}'::text[])
               from jsonb_array_elements(v_refund->'steps') with ordinality s));
          v_refunds_new := v_refunds_new + 1;
        end if;
      exception when others then
        v_reason := case when sqlerrm = any (v_known) then sqlerrm else 'invalid order' end;
        v_refused := v_refused || jsonb_build_array(jsonb_build_object('orderCode', v_code, 'reason', v_reason));
      end;
    end if;
  end loop;

  if v_new + v_refunds_new > 0 then
    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'shopee.capture', 'shopee_import', gen_random_uuid(),
        jsonb_build_object('new', v_new, 'stored', v_stored, 'beforeLedger', v_before,
          'refundsNew', v_refunds_new, 'refundsStored', v_refunds_stored,
          'refused', jsonb_array_length(v_refused)));
    update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  end if;

  return jsonb_build_object('new', v_new, 'stored', v_stored, 'beforeLedger', v_before,
    'refundsNew', v_refunds_new, 'refundsStored', v_refunds_stored, 'refused', v_refused);
end;
$$;
revoke all on function public.capture_shopee_orders(jsonb) from public, anon;
grant execute on function public.capture_shopee_orders(jsonb) to authenticated;

/*
 * The owner's say over which ledger row paid for a group of orders. `p_orders` is
 * `[{orderId, expectedRevision}]`, 1..20 distinct orders; each order's expected revision is its
 * overlay's current revision (0 = no decision yet), as `set_delivery_match`. One revision row,
 * one audit event per order, one `mutation_sequences` bump for the call.
 */
create or replace function public.set_shopee_payment_match(
  p_transaction_id uuid, p_orders jsonb, p_decision text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_ids uuid[] := '{}';
  v_expected integer[] := '{}';
  v_entry jsonb;
  v_i integer;
  v_order public.shopee_orders%rowtype;
  v_revisions integer[] := '{}';
  v_current_tx uuid;
  v_revision integer;
  v_found boolean;
  v_movement bigint;
  v_sum numeric := 0;
  v_snapshot jsonb;
  v_snapshots jsonb := '[]'::jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_decision is null or p_decision not in ('matched','unmatched')
    or (p_decision = 'matched') <> (p_transaction_id is not null) then
    raise exception 'invalid shopee match decision';
  end if;
  if jsonb_typeof(p_orders) is distinct from 'array' or jsonb_array_length(p_orders) not between 1 and 20 then
    raise exception 'invalid shopee match orders';
  end if;
  for v_entry in select value from jsonb_array_elements(p_orders) loop
    begin
      if jsonb_typeof(v_entry) is distinct from 'object'
        or jsonb_typeof(v_entry->'orderId') is distinct from 'string'
        or jsonb_typeof(v_entry->'expectedRevision') is distinct from 'number'
        or v_entry->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,8})$'
        then raise exception 'invalid'; end if;
      v_ids := v_ids || (v_entry->>'orderId')::uuid;
      v_expected := v_expected || (v_entry->>'expectedRevision')::integer;
    exception when others then
      raise exception 'invalid shopee match orders';
    end;
  end loop;
  if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'invalid shopee match orders';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  if p_decision = 'matched' then
    select true, (select sum(c.amount_minor) from public.source_components c
                   where c.transaction_id = t.id and c.owner_id = v_owner)
      into v_found, v_movement
      from public.source_transactions t
     where t.id = p_transaction_id and t.owner_id = v_owner;
    if v_found is null then raise exception 'transaction not owned'; end if;
  end if;

  for v_i in 1..cardinality(v_ids) loop
    select * into v_order from public.shopee_orders where id = v_ids[v_i] and owner_id = v_owner;
    if v_order.id is null then raise exception 'shopee order not owned'; end if;
    if v_order.total_minor = 0 then raise exception 'shopee order paid outside the platform'; end if;
    v_sum := v_sum + v_order.total_minor;

    select revision, transaction_id into v_revision, v_current_tx
      from public.shopee_payment_match_overlays
      where order_id = v_ids[v_i] and owner_id = v_owner for update;
    v_revision := coalesce(v_revision, 0);
    if v_revision <> v_expected[v_i] then raise exception 'shopee match revision conflict'; end if;
    v_revisions := v_revisions || v_revision;

    if p_decision = 'matched' then
      if v_current_tx is not null and v_current_tx <> p_transaction_id then
        raise exception 'shopee order already matched to another ledger row';
      end if;
    elsif v_current_tx is not null then
      -- A combined checkout is undone whole: every order on that row must be listed.
      if exists (select 1 from public.shopee_payment_match_overlays o
                  where o.owner_id = v_owner and o.transaction_id = v_current_tx
                    and o.order_id <> all (v_ids)) then
        raise exception 'combined shopee match must be undone whole';
      end if;
    end if;
  end loop;

  if p_decision = 'matched' then
    if exists (select 1 from public.shopee_payment_match_overlays o
                where o.owner_id = v_owner and o.transaction_id = p_transaction_id
                  and o.order_id <> all (v_ids)) then
      raise exception 'ledger row already claimed by another shopee order';
    end if;
    if v_movement is distinct from -v_sum then raise exception 'shopee match amount mismatch'; end if;
  end if;

  for v_i in 1..cardinality(v_ids) loop
    insert into public.shopee_payment_match_overlays(order_id, owner_id, decision, transaction_id, revision)
      values (v_ids[v_i], v_owner, p_decision, p_transaction_id, v_revisions[v_i] + 1)
    on conflict (order_id) do update set decision = excluded.decision,
      transaction_id = excluded.transaction_id, revision = excluded.revision, updated_at = now();

    select to_jsonb(o) into v_snapshot from public.shopee_payment_match_overlays o
      where o.order_id = v_ids[v_i] and o.owner_id = v_owner;
    insert into public.shopee_payment_match_revisions(owner_id, order_id, revision, snapshot, changed_by)
      values (v_owner, v_ids[v_i], v_revisions[v_i] + 1, v_snapshot, v_owner);
    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'shopee.match.' || p_decision, 'shopee_order', v_ids[v_i],
        jsonb_build_object('revision', v_revisions[v_i] + 1, 'decision', p_decision,
          'group', cardinality(v_ids)));
    v_snapshots := v_snapshots || jsonb_build_array(v_snapshot);
  end loop;
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return jsonb_build_object('orders', v_snapshots);
end;
$$;
revoke all on function public.set_shopee_payment_match(uuid,jsonb,text) from public, anon;
grant execute on function public.set_shopee_payment_match(uuid,jsonb,text) to authenticated;

/*
 * Link orders to the other ledger rows they relate to. Current state of an
 * (order, transaction, kind) is its newest event, so linking a linked row or unlinking an
 * unlinked one appends nothing and returns `changed: 0`. The kind rules apply to `link`; an
 * `unlink` needs only that the owner holds the order and the row.
 */
create or replace function public.set_shopee_order_links(
  p_kind text, p_transaction_id uuid, p_order_ids uuid[], p_action text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_order public.shopee_orders%rowtype;
  v_movement bigint;
  v_found boolean;
  v_latest text;
  v_changed integer := 0;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_kind is null or p_kind not in ('wallet_topup','spaylater_repayment','refund_deposit')
    or p_action is null or p_action not in ('link','unlink')
    or p_transaction_id is null or p_order_ids is null
    or cardinality(p_order_ids) not between 1 and 20
    or array_position(p_order_ids, null) is not null
    or (select count(distinct x) from unnest(p_order_ids) x) <> cardinality(p_order_ids)
    or (p_kind = 'refund_deposit' and cardinality(p_order_ids) <> 1)
    then raise exception 'invalid shopee link'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select true, (select sum(c.amount_minor) from public.source_components c
                 where c.transaction_id = t.id and c.owner_id = v_owner)
    into v_found, v_movement
    from public.source_transactions t
   where t.id = p_transaction_id and t.owner_id = v_owner;
  if v_found is null then raise exception 'transaction not owned'; end if;

  foreach v_id in array p_order_ids loop
    select * into v_order from public.shopee_orders where id = v_id and owner_id = v_owner;
    if v_order.id is null then raise exception 'shopee order not owned'; end if;

    if p_action = 'link' then
      if p_kind = 'wallet_topup' then
        if v_order.payment_kind <> 'wallet' or v_movement is null or v_movement >= 0 then
          raise exception 'shopee link kind mismatch'; end if;
      elsif p_kind = 'spaylater_repayment' then
        if v_order.payment_kind <> 'spaylater' or v_movement is null or v_movement >= 0 then
          raise exception 'shopee link kind mismatch'; end if;
      else
        if v_movement is null or v_movement <= 0
          or not exists (select 1 from public.shopee_refunds r
                          where r.order_id = v_order.id and r.owner_id = v_owner
                            and r.refund_to = 'bank' and r.refund_minor = v_movement) then
          raise exception 'shopee link kind mismatch'; end if;
      end if;
    end if;

    select action into v_latest from public.shopee_order_links
      where owner_id = v_owner and order_id = v_id and transaction_id = p_transaction_id and kind = p_kind
      order by changed_at desc, id desc limit 1;
    if coalesce(v_latest, 'unlink') <> p_action then
      insert into public.shopee_order_links(owner_id, order_id, transaction_id, kind, action, changed_by)
        values (v_owner, v_id, p_transaction_id, p_kind, p_action, v_owner);
      v_changed := v_changed + 1;
    end if;
  end loop;

  if v_changed > 0 then
    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'shopee.link.' || p_action, 'shopee_order_link', p_transaction_id,
        jsonb_build_object('kind', p_kind, 'action', p_action, 'changed', v_changed));
    update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  end if;

  return jsonb_build_object('changed', v_changed);
end;
$$;
revoke all on function public.set_shopee_order_links(text,uuid,uuid[],text) from public, anon;
grant execute on function public.set_shopee_order_links(text,uuid,uuid[],text) to authenticated;

-- ## Backup v15 -> v16
--
-- Seven owner tables join the backup: shopee_orders, shopee_order_items, shopee_order_price_lines,
-- shopee_refunds, shopee_payment_match_overlays, shopee_payment_match_revisions and
-- shopee_order_links. They are appended after the v15 list, parents first (every child carries an
-- order id; the overlay and the links also reference a ledger row, which a restore has already
-- written by then), so the indices of v15 keep meaning exactly what they meant and v2 through v15
-- files stay restorable and leave the new tables empty. Copied from 049, the latest definitions.
-- Money (an order's total, an item's two prices, a price line's signed amount, a refund) crosses as
-- canonical int64 text and is re-checked on restore; the revisions' snapshots are rebound to the
-- restoring owner as every other revisions table's are, and changed_by is the restoring owner.

alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16));

alter table public.restore_chunks
  drop constraint if exists restore_chunks_v2_binding,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions','source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events','mutation_sequences','slips','slip_match_overlays','slip_match_revisions','cash_entries','cash_entry_overlays','cash_entry_revisions','slip_correction_overlays','slip_correction_revisions','notification_cards','notification_card_correction_overlays','notification_card_correction_revisions','notification_card_decision_overlays','notification_card_decision_revisions','receipts','receipt_items','receipt_discounts','receipt_match_overlays','receipt_match_revisions','deliveries','delivery_items','delivery_adjustments','delivery_match_overlays','delivery_match_revisions','rides','ride_adjustments','ride_match_overlays','ride_match_revisions','lineman_order_details','category_parents','category_provenance','category_reviews','shopee_orders','shopee_order_items','shopee_order_price_lines','shopee_refunds','shopee_payment_match_overlays','shopee_payment_match_revisions','shopee_order_links')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

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
    'notification_card_correction_overlays',(select coalesce(jsonb_agg(
      to_jsonb(x)-'amount_minor'-'balance_minor'
        ||case when amount_minor is null then jsonb_build_object('amount_minor',null) else jsonb_build_object('amount_minor',amount_minor::text) end
        ||case when balance_minor is null then jsonb_build_object('balance_minor',null) else jsonb_build_object('balance_minor',balance_minor::text) end
      order by card_id),'[]') from public.notification_card_correction_overlays x where owner_id=v_owner),
    'notification_card_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_correction_revisions x where owner_id=v_owner),
    'notification_card_decision_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id),'[]') from public.notification_card_decision_overlays x where owner_id=v_owner),
    'notification_card_decision_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_decision_revisions x where owner_id=v_owner),
    -- Five nullable money columns plus the one not-null (`net_minor`). Each is stringified only
    -- when present, the same shape every nullable money column above uses, applied five times
    -- because a receipt carries that many.
    'receipts',(select coalesce(jsonb_agg(
      to_jsonb(x)-'subtotal_minor'-'net_minor'-'vat_pre_minor'-'vat_minor'-'vat_total_minor'
        ||jsonb_build_object('net_minor',net_minor::text)
        ||case when subtotal_minor is null then jsonb_build_object('subtotal_minor',null) else jsonb_build_object('subtotal_minor',subtotal_minor::text) end
        ||case when vat_pre_minor is null then jsonb_build_object('vat_pre_minor',null) else jsonb_build_object('vat_pre_minor',vat_pre_minor::text) end
        ||case when vat_minor is null then jsonb_build_object('vat_minor',null) else jsonb_build_object('vat_minor',vat_minor::text) end
        ||case when vat_total_minor is null then jsonb_build_object('vat_total_minor',null) else jsonb_build_object('vat_total_minor',vat_total_minor::text) end
      order by id),'[]') from public.receipts x where owner_id=v_owner),
    'receipt_items',(select coalesce(jsonb_agg(
      to_jsonb(x)-'unit_price_minor'-'amount_minor'
        ||jsonb_build_object('amount_minor',amount_minor::text)
        ||case when unit_price_minor is null then jsonb_build_object('unit_price_minor',null) else jsonb_build_object('unit_price_minor',unit_price_minor::text) end
      order by receipt_id,position),'[]') from public.receipt_items x where owner_id=v_owner),
    'receipt_discounts',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by receipt_id,position),'[]') from public.receipt_discounts x where owner_id=v_owner),
    'receipt_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by receipt_id),'[]') from public.receipt_match_overlays x where owner_id=v_owner),
    'receipt_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by receipt_id,revision),'[]') from public.receipt_match_revisions x where owner_id=v_owner),
    'deliveries',(select coalesce(jsonb_agg(
      to_jsonb(x)-'food_minor'-'delivery_fee_minor'-'total_minor'
        ||jsonb_build_object('food_minor',food_minor::text,'total_minor',total_minor::text)
        ||case when delivery_fee_minor is null then jsonb_build_object('delivery_fee_minor',null) else jsonb_build_object('delivery_fee_minor',delivery_fee_minor::text) end
      order by id),'[]') from public.deliveries x where owner_id=v_owner),
    'delivery_items',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by delivery_id,position),'[]') from public.delivery_items x where owner_id=v_owner),
    'delivery_adjustments',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by delivery_id,position),'[]') from public.delivery_adjustments x where owner_id=v_owner),
    'delivery_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by delivery_id),'[]') from public.delivery_match_overlays x where owner_id=v_owner),
    'delivery_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by delivery_id,revision),'[]') from public.delivery_match_revisions x where owner_id=v_owner),
    'rides',(select coalesce(jsonb_agg(
      to_jsonb(x)-'fare_minor'-'platform_fee_minor'-'total_minor'
        ||jsonb_build_object('fare_minor',fare_minor::text,'platform_fee_minor',platform_fee_minor::text,'total_minor',total_minor::text)
      order by id),'[]') from public.rides x where owner_id=v_owner),
    'ride_adjustments',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by ride_id,position),'[]') from public.ride_adjustments x where owner_id=v_owner),
    'ride_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by ride_id),'[]') from public.ride_match_overlays x where owner_id=v_owner),
    'ride_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by ride_id,revision),'[]') from public.ride_match_revisions x where owner_id=v_owner),
    'lineman_order_details',(select coalesce(jsonb_agg(to_jsonb(x)-'charged_minor'||jsonb_build_object('charged_minor',charged_minor::text) order by delivery_id),'[]') from public.lineman_order_details x where owner_id=v_owner),
    'category_parents',(select coalesce(jsonb_agg(to_jsonb(x) order by category_id),'[]') from public.category_parents x where owner_id=v_owner),
    'category_provenance',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id,overlay_revision),'[]') from public.category_provenance x where owner_id=v_owner),
    'category_reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id,overlay_revision),'[]') from public.category_reviews x where owner_id=v_owner),
    'shopee_orders',(select coalesce(jsonb_agg(to_jsonb(x)-'total_minor'||jsonb_build_object('total_minor',total_minor::text) order by id),'[]') from public.shopee_orders x where owner_id=v_owner),
    'shopee_order_items',(select coalesce(jsonb_agg(
      to_jsonb(x)-'price_minor'-'original_price_minor'
        ||case when price_minor is null then jsonb_build_object('price_minor',null) else jsonb_build_object('price_minor',price_minor::text) end
        ||case when original_price_minor is null then jsonb_build_object('original_price_minor',null) else jsonb_build_object('original_price_minor',original_price_minor::text) end
      order by order_id,position),'[]') from public.shopee_order_items x where owner_id=v_owner),
    'shopee_order_price_lines',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by order_id,position),'[]') from public.shopee_order_price_lines x where owner_id=v_owner),
    'shopee_refunds',(select coalesce(jsonb_agg(to_jsonb(x)-'refund_minor'||jsonb_build_object('refund_minor',refund_minor::text) order by id),'[]') from public.shopee_refunds x where owner_id=v_owner),
    'shopee_payment_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by order_id),'[]') from public.shopee_payment_match_overlays x where owner_id=v_owner),
    'shopee_payment_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by order_id,revision),'[]') from public.shopee_payment_match_revisions x where owner_id=v_owner),
    'shopee_order_links',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.shopee_order_links x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',16,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

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
 if v_schema_text not in ('2','3','4','5','6','7','8','9','10','11','12','13','14','15','16') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 v_schema:=v_schema_text::integer;
 v_expected_kinds:=v_base_kinds;
 if v_schema>=3 then v_expected_kinds:=v_expected_kinds||array['slips']; end if;
 if v_schema>=4 then v_expected_kinds:=v_expected_kinds||array['slip_match_overlays','slip_match_revisions']; end if;
 if v_schema>=5 then v_expected_kinds:=v_expected_kinds||array['cash_entries','cash_entry_overlays','cash_entry_revisions','slip_correction_overlays','slip_correction_revisions']; end if;
 if v_schema>=6 then v_expected_kinds:=v_expected_kinds||array['notification_cards']; end if;
 if v_schema>=7 then v_expected_kinds:=v_expected_kinds||array['notification_card_correction_overlays','notification_card_correction_revisions','notification_card_decision_overlays','notification_card_decision_revisions']; end if;
 if v_schema>=8 then v_expected_kinds:=v_expected_kinds||array['receipts','receipt_items','receipt_discounts']; end if;
 if v_schema>=9 then v_expected_kinds:=v_expected_kinds||array['receipt_match_overlays','receipt_match_revisions']; end if;
 if v_schema>=10 then v_expected_kinds:=v_expected_kinds||array['deliveries','delivery_items','delivery_adjustments']; end if;
 if v_schema>=11 then v_expected_kinds:=v_expected_kinds||array['delivery_match_overlays','delivery_match_revisions']; end if;
 if v_schema>=12 then v_expected_kinds:=v_expected_kinds||array['rides','ride_adjustments','ride_match_overlays','ride_match_revisions']; end if;
 if v_schema>=13 then v_expected_kinds:=v_expected_kinds||array['lineman_order_details']; end if;
 if v_schema>=14 then v_expected_kinds:=v_expected_kinds||array['category_parents','category_provenance','category_reviews']; end if;
 if v_schema>=16 then v_expected_kinds:=v_expected_kinds||array['shopee_orders','shopee_order_items','shopee_order_price_lines','shopee_refunds','shopee_payment_match_overlays','shopee_payment_match_revisions','shopee_order_links']; end if;
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
    or exists(select 1 from public.notification_card_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_correction_revisions where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_revisions where owner_id=v_owner)
    or exists(select 1 from public.receipts where owner_id=v_owner)
    or exists(select 1 from public.receipt_items where owner_id=v_owner)
    or exists(select 1 from public.receipt_discounts where owner_id=v_owner)
    or exists(select 1 from public.receipt_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.receipt_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.deliveries where owner_id=v_owner)
    or exists(select 1 from public.delivery_items where owner_id=v_owner)
    or exists(select 1 from public.delivery_adjustments where owner_id=v_owner)
    or exists(select 1 from public.delivery_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.delivery_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.rides where owner_id=v_owner)
    or exists(select 1 from public.ride_adjustments where owner_id=v_owner)
    or exists(select 1 from public.ride_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.ride_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.lineman_order_details where owner_id=v_owner)
    or exists(select 1 from public.category_provenance where owner_id=v_owner)
    or exists(select 1 from public.category_reviews where owner_id=v_owner)
    or exists(select 1 from public.shopee_orders where owner_id=v_owner)
    or exists(select 1 from public.shopee_order_items where owner_id=v_owner)
    or exists(select 1 from public.shopee_order_price_lines where owner_id=v_owner)
    or exists(select 1 from public.shopee_refunds where owner_id=v_owner)
    or exists(select 1 from public.shopee_payment_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.shopee_payment_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.shopee_order_links where owner_id=v_owner)
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
 -- A parent link is part of the category set, which the restore replaces whole.
 delete from public.category_parents where owner_id=v_owner;
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
    when 'receipts' then
     -- `net_minor` is not nullable; the other four are, and each is checked only when present —
     -- the same shape the cash and notification-card correction overlays use for their own
     -- nullable money columns above.
     if jsonb_typeof(v_row->'net_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'net_minor')
       then raise exception 'restore receipt money must be canonical int64 text'; end if;
     if v_row->'subtotal_minor' is not null and jsonb_typeof(v_row->'subtotal_minor') <> 'null' then
      if jsonb_typeof(v_row->'subtotal_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'subtotal_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_pre_minor' is not null and jsonb_typeof(v_row->'vat_pre_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_pre_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_pre_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_minor' is not null and jsonb_typeof(v_row->'vat_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_total_minor' is not null and jsonb_typeof(v_row->'vat_total_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_total_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_total_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     insert into public.receipts(id,owner_id,merchant,store_code,branch_name,receipt_number,purchased_on,
       purchased_at_time,payment_method,subtotal_minor,net_minor,unit_count,vat_pre_minor,vat_minor,
       vat_total_minor,vat_code,supersedes_receipt_number,completeness,failed_checks,inapplicable_checks,
       sources,items_source,items_complete,created_at,updated_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'merchant',v_row->>'store_code',v_row->>'branch_name',v_row->>'receipt_number',
        (v_row->>'purchased_on')::date,nullif(v_row->>'purchased_at_time','')::time,v_row->>'payment_method',
        nullif(v_row->>'subtotal_minor','')::bigint,(v_row->>'net_minor')::bigint,nullif(v_row->>'unit_count','')::integer,
        nullif(v_row->>'vat_pre_minor','')::bigint,nullif(v_row->>'vat_minor','')::bigint,nullif(v_row->>'vat_total_minor','')::bigint,
        v_row->>'vat_code',v_row->>'supersedes_receipt_number',v_row->>'completeness',
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'failed_checks','[]'::jsonb))),
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'inapplicable_checks','[]'::jsonb))),
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'sources','[]'::jsonb))),
        v_row->>'items_source',(v_row->>'items_complete')::boolean,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz);
    when 'receipt_items' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore receipt item money must be canonical int64 text'; end if;
     if v_row->'unit_price_minor' is not null and jsonb_typeof(v_row->'unit_price_minor') <> 'null' then
      if jsonb_typeof(v_row->'unit_price_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'unit_price_minor')
        then raise exception 'restore receipt item money must be canonical int64 text'; end if;
     end if;
     insert into public.receipt_items(id,owner_id,receipt_id,line_no,position,quantity,name,display_name,
       unit_price_minor,amount_minor,vat_exempt,is_promotion)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'line_no')::integer,(v_row->>'position')::integer,
        (v_row->>'quantity')::integer,v_row->>'name',v_row->>'display_name',nullif(v_row->>'unit_price_minor','')::bigint,
        (v_row->>'amount_minor')::bigint,(v_row->>'vat_exempt')::boolean,(v_row->>'is_promotion')::boolean);
    when 'receipt_discounts' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore receipt discount money must be canonical int64 text'; end if;
     insert into public.receipt_discounts(id,owner_id,receipt_id,position,name,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'position')::integer,v_row->>'name',(v_row->>'amount_minor')::bigint);
   when 'receipt_match_overlays' then insert into public.receipt_match_overlays(receipt_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'receipt_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   -- The snapshot carries an owner id; rebound like every other revisions table's (D-044).
   when 'receipt_match_revisions' then insert into public.receipt_match_revisions(id,owner_id,receipt_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'deliveries' then
     if jsonb_typeof(v_row->'food_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'food_minor',true)
       or jsonb_typeof(v_row->'total_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'total_minor',true)
       then raise exception 'restore delivery money must be canonical int64 text'; end if;
     if v_row->'delivery_fee_minor' is not null and jsonb_typeof(v_row->'delivery_fee_minor') <> 'null' then
      if jsonb_typeof(v_row->'delivery_fee_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'delivery_fee_minor',true)
        then raise exception 'restore delivery money must be canonical int64 text'; end if;
     end if;
     insert into public.deliveries(id,owner_id,platform,booking_id,restaurant,payment_method,receipt_sent_at,
       food_minor,delivery_fee_minor,total_minor,created_at,service)
      values((v_row->>'id')::uuid,v_owner,v_row->>'platform',v_row->>'booking_id',v_row->>'restaurant',v_row->>'payment_method',
        (v_row->>'receipt_sent_at')::timestamptz,(v_row->>'food_minor')::bigint,nullif(v_row->>'delivery_fee_minor','')::bigint,
        (v_row->>'total_minor')::bigint,(v_row->>'created_at')::timestamptz,coalesce(v_row->>'service','food'));
    when 'delivery_items' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor',true)
       then raise exception 'restore delivery item money must be canonical int64 text'; end if;
     insert into public.delivery_items(id,owner_id,delivery_id,position,quantity,name,options,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'delivery_id')::uuid,(v_row->>'position')::integer,(v_row->>'quantity')::integer,
        v_row->>'name',(select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'options','[]'::jsonb))),
        (v_row->>'amount_minor')::bigint);
    when 'delivery_adjustments' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor',true)
       then raise exception 'restore delivery adjustment money must be canonical int64 text'; end if;
     insert into public.delivery_adjustments(id,owner_id,delivery_id,position,kind,name,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'delivery_id')::uuid,(v_row->>'position')::integer,v_row->>'kind',v_row->>'name',(v_row->>'amount_minor')::bigint);
   when 'delivery_match_overlays' then insert into public.delivery_match_overlays(delivery_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'delivery_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'delivery_match_revisions' then insert into public.delivery_match_revisions(id,owner_id,delivery_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'delivery_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'rides' then
     if jsonb_typeof(v_row->'fare_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'fare_minor',true)
       or jsonb_typeof(v_row->'platform_fee_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'platform_fee_minor',true)
       or jsonb_typeof(v_row->'total_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'total_minor',true)
       then raise exception 'restore ride money must be canonical int64 text'; end if;
     insert into public.rides(id,owner_id,booking_id,ride_type,picked_up_at,dropped_off_at,pickup_place,dropoff_place,
       distance_meters,duration_minutes,payment_method,fare_minor,platform_fee_minor,total_minor,created_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'booking_id',v_row->>'ride_type',(v_row->>'picked_up_at')::timestamptz,
        (v_row->>'dropped_off_at')::timestamptz,v_row->>'pickup_place',v_row->>'dropoff_place',(v_row->>'distance_meters')::integer,
        (v_row->>'duration_minutes')::integer,v_row->>'payment_method',(v_row->>'fare_minor')::bigint,(v_row->>'platform_fee_minor')::bigint,
        (v_row->>'total_minor')::bigint,(v_row->>'created_at')::timestamptz);
    when 'ride_adjustments' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor',true)
       then raise exception 'restore ride adjustment money must be canonical int64 text'; end if;
     insert into public.ride_adjustments(id,owner_id,ride_id,position,kind,name,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'ride_id')::uuid,(v_row->>'position')::integer,v_row->>'kind',v_row->>'name',(v_row->>'amount_minor')::bigint);
   when 'ride_match_overlays' then insert into public.ride_match_overlays(ride_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'ride_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'ride_match_revisions' then insert into public.ride_match_revisions(id,owner_id,ride_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'ride_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'lineman_order_details' then
     if jsonb_typeof(v_row->'charged_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'charged_minor',true)
       then raise exception 'restore LINE MAN order money must be canonical int64 text'; end if;
     insert into public.lineman_order_details(delivery_id,owner_id,ordered_at,charged_minor)
      values((v_row->>'delivery_id')::uuid,v_owner,(v_row->>'ordered_at')::timestamptz,(v_row->>'charged_minor')::bigint);
   when 'category_parents' then insert into public.category_parents(category_id,owner_id,parent_id,created_at)
    values((v_row->>'category_id')::uuid,v_owner,(v_row->>'parent_id')::uuid,(v_row->>'created_at')::timestamptz);
   when 'category_provenance' then insert into public.category_provenance(owner_id,transaction_id,overlay_revision,source,detail,created_at)
    values(v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'overlay_revision')::integer,v_row->>'source',v_row->'detail',(v_row->>'created_at')::timestamptz);
   when 'category_reviews' then insert into public.category_reviews(owner_id,transaction_id,overlay_revision,created_at)
    values(v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'overlay_revision')::integer,(v_row->>'created_at')::timestamptz);
   when 'shopee_orders' then
     if jsonb_typeof(v_row->'total_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'total_minor',true)
       then raise exception 'restore Shopee order money must be canonical int64 text'; end if;
     insert into public.shopee_orders(id,owner_id,order_code,link_id,placed_at,paid_at,shop,payment_method,payment_kind,
       total_minor,item_price_is,facts_digest,created_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'order_code',v_row->>'link_id',(v_row->>'placed_at')::timestamptz,
        nullif(v_row->>'paid_at','')::timestamptz,v_row->>'shop',v_row->>'payment_method',v_row->>'payment_kind',
        (v_row->>'total_minor')::bigint,nullif(v_row->>'item_price_is',''),v_row->>'facts_digest',(v_row->>'created_at')::timestamptz);
   when 'shopee_order_items' then
     if v_row->'price_minor' is not null and jsonb_typeof(v_row->'price_minor') <> 'null' then
      if jsonb_typeof(v_row->'price_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'price_minor',true)
        then raise exception 'restore Shopee item money must be canonical int64 text'; end if;
     end if;
     if v_row->'original_price_minor' is not null and jsonb_typeof(v_row->'original_price_minor') <> 'null' then
      if jsonb_typeof(v_row->'original_price_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'original_price_minor',true)
        then raise exception 'restore Shopee item money must be canonical int64 text'; end if;
     end if;
     insert into public.shopee_order_items(id,owner_id,order_id,position,name,variation,quantity,price_minor,original_price_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'order_id')::uuid,(v_row->>'position')::integer,v_row->>'name',
        nullif(v_row->>'variation',''),(v_row->>'quantity')::integer,nullif(v_row->>'price_minor','')::bigint,
        nullif(v_row->>'original_price_minor','')::bigint);
   when 'shopee_order_price_lines' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore Shopee price line money must be canonical int64 text'; end if;
     insert into public.shopee_order_price_lines(id,owner_id,order_id,position,label,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'order_id')::uuid,(v_row->>'position')::integer,v_row->>'label',(v_row->>'amount_minor')::bigint);
   when 'shopee_refunds' then
     if jsonb_typeof(v_row->'refund_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'refund_minor',true)
       then raise exception 'restore Shopee refund money must be canonical int64 text'; end if;
     insert into public.shopee_refunds(id,owner_id,order_id,request_id,requested_at,refund_minor,refund_to,requested_by,reason,steps,created_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'order_id')::uuid,v_row->>'request_id',(v_row->>'requested_at')::timestamptz,
        (v_row->>'refund_minor')::bigint,v_row->>'refund_to',v_row->>'requested_by',nullif(v_row->>'reason',''),
        (select coalesce(array_agg(s.value order by s.ordinality),'{}'::text[]) from jsonb_array_elements_text(coalesce(v_row->'steps','[]'::jsonb)) with ordinality s),
        (v_row->>'created_at')::timestamptz);
   when 'shopee_payment_match_overlays' then insert into public.shopee_payment_match_overlays(order_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'order_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'shopee_payment_match_revisions' then insert into public.shopee_payment_match_revisions(id,owner_id,order_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'order_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
   when 'shopee_order_links' then insert into public.shopee_order_links(id,owner_id,order_id,transaction_id,kind,action,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'order_id')::uuid,(v_row->>'transaction_id')::uuid,v_row->>'kind',v_row->>'action',(v_row->>'changed_at')::timestamptz,v_owner);
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

-- A slip whose QR does not decode may be captured on its printed reference (D-258).
--
-- Migration 011 made the QR the only identity a slip could have: `qr_payload` and
-- `bank_qr_code` were NOT NULL and the dedup key's reference came from the QR. Some real
-- Krungthai and SCB slips carry a QR that will not decode (cropped, compressed, re-shared
-- as a screenshot), and the owner had no way to keep them short of typing them as cash.
-- The printed รหัสอ้างอิง serves as identity in the same (owner, bank_code, slip_reference)
-- key. For SCB it has the QR reference's shape (date-prefixed, 25 characters), so the two
-- kinds of capture of one SCB slip meet on that key. Krungthai prints a different reference
-- from its QR's (17 characters against the QR's letter-first 19-21), so for Krungthai the
-- bank/date/time/amount guard below is the only thing that meets a QR capture.
--
-- What changes:
--
--   * `qr_payload` and `bank_qr_code` become nullable, **both or neither** (`slips_qr_pair`).
--     A null `qr_payload` means "identity read from the printed reference". No new column:
--     every `restore_backup` since 011 names the slips columns explicitly, and a null passes
--     through `v_row->>'qr_payload'` unchanged, so old and new backups restore as-is.
--   * `capture_slip` accepts a printed-identity request only for KTB and SCB (the two banks
--     whose printed reference has been checked against their QR), with a time of day.
--   * A printed reference is typed or OCR-read, so it can be wrong where a QR cannot. An
--     exact (owner, bank, reference) hit still returns `captured: false`, exactly as a QR
--     re-share does. But a printed capture that matches a stored slip (of either kind) on
--     bank, date, time (or a stored slip with no time) and amount under a *different* reference is refused with
--     'slip may already be captured' — fail closed, because the likeliest cause is a
--     misread reference of a slip already held, and storing it would double-count it while
--     treating it as captured would silently drop a genuinely different payment. The owner
--     resolves it by hand.
--   * A QR capture is held to the same guard against stored *printed* slips only, so a slip
--     first captured from print and re-sent with a readable QR is not stored twice. Against
--     other QR slips it behaves exactly as before. The audit detail now names the identity kind.

begin;

alter table public.slips
  alter column qr_payload drop not null,
  alter column bank_qr_code drop not null;

alter table public.slips
  add constraint slips_qr_pair check ((qr_payload is null) = (bank_qr_code is null));

-- Migration 011's body, with the printed-identity branch added.
create or replace function public.capture_slip(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_slip public.slips%rowtype;
  v_existing public.slips%rowtype;
  v_amount text := p_request->>'amountMinor';
  v_occurred_on date;
  v_captured boolean := true;
  v_printed boolean;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;

  -- Money crosses the wire as canonical text and is validated as such before any cast.
  -- The int64 bound is the point: a value outside it would otherwise surface as an
  -- uncaught 22P02 halfway through, rather than as a refusal the route can map.
  if jsonb_typeof(p_request->'amountMinor') is distinct from 'string'
    or not private.is_canonical_int64_text(v_amount)
    then raise exception 'slip amount must be canonical int64 text'; end if;

  begin
    v_occurred_on := (p_request->>'occurredOn')::date;
  exception when others then raise exception 'invalid slip date'; end;

  -- The Buddhist-era guard D-050 asked for, and the reason it is here rather than in a
  -- CHECK: a CHECK constraint cannot call current_date. A Thai slip printing `2569` typed
  -- through unconverted lands 543 years in the future and is refused outright, which is
  -- the fail-closed behaviour D-031 established for the same 543-year shift in statements.
  if v_occurred_on > current_date + 1 or v_occurred_on < (current_date - interval '10 years')::date then
    raise exception 'slip date is outside the plausible window';
  end if;

  -- Printed identity (D-258): no QR payload. Only KTB and SCB, no QR code, and a time of
  -- day, because the duplicate guard below needs the time to mean anything.
  v_printed := (p_request->>'qrPayload') is null;
  if v_printed then
    if coalesce(p_request->>'bankCode','') not in ('KTB','SCB')
      or (p_request->>'bankQrCode') is not null
      or nullif(p_request->>'occurredAtTime','') is null
      then raise exception 'invalid slip'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  -- Idempotent on the slip identity. A re-share returns what was already stored and changes
  -- nothing — including when the owner types a different amount the second time, because
  -- the table is append-only and silently overwriting a confirmed value would be worse
  -- than refusing to. The caller is told which of the two happened.
  select * into v_existing from public.slips
    where owner_id = v_owner
      and bank_code = p_request->>'bankCode'
      and slip_reference = p_request->>'slipReference';
  if v_existing.id is not null then
    v_slip := v_existing;
    v_captured := false;
  else
    -- A printed reference can be misread where a QR cannot, and Krungthai prints a different
    -- reference from its QR's. Same bank, date, time and amount under another reference is
    -- refused rather than stored or treated as held: a printed capture against any stored
    -- slip, and a QR capture against a stored *printed* one (the same slip re-sent with a
    -- readable QR). Two QR slips never meet here — their references are exact.
    if v_printed or exists(select 1 from public.slips where owner_id = v_owner and qr_payload is null) then
      begin
        if exists(select 1 from public.slips
            where owner_id = v_owner
              and (v_printed or qr_payload is null)
              and bank_code = p_request->>'bankCode'
              and occurred_on = v_occurred_on
              -- A stored slip with no time could be this payment at any minute, so it counts.
              -- A QR capture may carry no time; then the day and amount alone match.
              and (occurred_at_time is null or nullif(p_request->>'occurredAtTime','') is null
                or occurred_at_time = (p_request->>'occurredAtTime')::time)
              and amount_minor = v_amount::bigint) then
          raise exception 'slip may already be captured';
        end if;
      exception
        when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
          then raise exception 'invalid slip';
      end;
    end if;

    begin
      insert into public.slips(owner_id, bank_code, bank_qr_code, slip_reference, qr_payload, kind,
        amount_minor, currency, occurred_on, occurred_at_time, counterparty, category_id, note)
      values (v_owner, p_request->>'bankCode', p_request->>'bankQrCode', p_request->>'slipReference',
        p_request->>'qrPayload', p_request->>'kind', v_amount::bigint, coalesce(p_request->>'currency','THB'),
        v_occurred_on, nullif(p_request->>'occurredAtTime','')::time,
        nullif(btrim(coalesce(p_request->>'counterparty','')),''), nullif(p_request->>'categoryId','')::uuid,
        nullif(p_request->>'note',''))
      returning * into v_slip;
    exception
      when check_violation then raise exception 'invalid slip';
      when foreign_key_violation then raise exception 'slip category not owned';
      when not_null_violation then raise exception 'invalid slip';
      -- A malformed category id or time casts inside this INSERT, so a 22P02 would
      -- otherwise escape as a bare SQL error rather than something the route can map.
      when invalid_text_representation then raise exception 'invalid slip';
      -- Unreachable while the select above holds the advisory lock, but a unique violation
      -- here would mean the dedup check and the constraint disagree, which is worth naming.
      when unique_violation then raise exception 'slip already captured';
    end;

    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'slip.capture', 'slip', v_slip.id,
        jsonb_build_object('bank_code', v_slip.bank_code, 'kind', v_slip.kind,
          'occurred_on', v_slip.occurred_on, 'currency', v_slip.currency,
          'identity', case when v_printed then 'printed' else 'qr' end));

    update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  end if;

  return jsonb_build_object('captured', v_captured, 'slip',
    to_jsonb(v_slip) - 'amount_minor' || jsonb_build_object('amount_minor', v_slip.amount_minor::text));
end;
$$;
revoke all on function public.capture_slip(jsonb) from public, anon;
grant execute on function public.capture_slip(jsonb) to authenticated;

commit;

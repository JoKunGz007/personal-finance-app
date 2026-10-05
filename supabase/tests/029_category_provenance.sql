begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- Category provenance, reviews and one-level subcategories (migration 048, D-245).
--
-- What this proves: the three tables are select-only with RLS forced, and provenance and reviews
-- refuse update and delete; the owner's editor records `owner` provenance only when the category
-- changes; `apply_category_proposals` keeps every other overlay field (an excluded row stays
-- excluded, a note stays), never overwrites an owner, legacy or reviewed category, may replace one
-- machine source with another, skips an archived category, writes nothing on a re-run, and steps
-- the sequence once per call; `review_transaction_category` accepts only the latest non-owner
-- row and is idempotent; `set_category_parent` keeps one level. Every value below is invented.

set local session_replication_role = replica;
delete from public.category_reviews;
delete from public.category_provenance;
delete from public.category_parents;
delete from public.overlay_revisions;
delete from public.transaction_overlays;
delete from public.ride_match_revisions;
delete from public.ride_match_overlays;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.categories;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-10-05T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000048', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '4848', 'THB', 'Asia/Bangkok'),
       ('cccccccc-0000-4000-8000-000000000049', '11111111-1111-4111-8111-111111111111', 'KBANK', 'Invented KBank', 'savings', '4949', 'THB', 'Asia/Bangkok');

insert into public.categories(id, owner_id, name, archived) values
  ('cafecafe-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Invented Food', false),
  ('cafecafe-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Invented Transport', false),
  ('cafecafe-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Invented Archived', true),
  ('cafecafe-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Invented Delivery', false),
  ('cafecafe-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Invented Dining', false);

-- t1 owner-edited, t2 excluded with a note, t3 untouched, t4 untouched, t5 legacy category with
-- no provenance, t6 a machine provenance row whose category is null, t7 owner-cleared, t8/t9 an
-- own transfer (SCB out, KBank in naming the SCB account).
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
select ('dddddddd-0000-4000-8000-00000000004' || n)::uuid, '11111111-1111-4111-8111-111111111111',
  'cccccccc-0000-4000-8000-000000000048', 'fingerprint-v1', repeat(n::text, 64), '2026-09-01', '12:00',
  '2026-09-01', 'Invented payment', 'INVENTED SHOP ' || n, '100000', 'THB'
from generate_series(1, 7) n;
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000048', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000048',
   'fingerprint-v1', repeat('8', 64), '2026-09-02', '09:00', '2026-09-02', 'Invented transfer', 'INVENTED TRANSFER OUT', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000049', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000049',
   'fingerprint-v1', repeat('9', 64), '2026-09-02', '09:01', '2026-09-02', 'Invented transfer', 'INVENTED FROM X4848', '100000', 'THB');
insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency) values
  ('eeeeeeee-0000-4000-8000-000000000048', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000048', 1, 'withdrawal', -77700, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000049', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000049', 1, 'deposit', 77700, 'THB');
insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
select ('eeeeeeee-0000-4000-8000-00000000004' || n)::uuid, '11111111-1111-4111-8111-111111111111',
  ('dddddddd-0000-4000-8000-00000000004' || n)::uuid, 1, 'withdrawal', -1000 * n, 'THB'
from generate_series(1, 7) n;
insert into public.transaction_overlays(transaction_id, owner_id, category_id, include_in_reporting, revision) values
  ('dddddddd-0000-4000-8000-000000000045', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000002', true, 1),
  ('dddddddd-0000-4000-8000-000000000046', '11111111-1111-4111-8111-111111111111', null, true, 1);
insert into public.overlay_revisions(owner_id, transaction_id, revision, snapshot, changed_by) values
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000046', 1, '{"category_id":null}', '11111111-1111-4111-8111-111111111111');
insert into public.category_provenance(owner_id, transaction_id, overlay_revision, source, detail) values
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000046', 1, 'rule', '{"rule_id":"invented"}');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000048', '11111111-1111-4111-8111-111111111111',
  'category TOTP', 'totp', 'verified', 'SYNTHETICCATEGORY', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z');
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

create temporary table seq_mark(label text primary key, value bigint);
create or replace function pg_temp.seq() returns bigint language sql as
  $$select sequence from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'$$;

-- 1. Privileges.
select ok(
  (select bool_and(has_table_privilege('authenticated', 'public.' || t, 'select')
      and not has_table_privilege('authenticated', 'public.' || t, 'insert')
      and not has_table_privilege('authenticated', 'public.' || t, 'update')
      and not has_table_privilege('authenticated', 'public.' || t, 'delete')
      and not has_table_privilege('anon', 'public.' || t, 'select'))
   from unnest(array['category_parents','category_provenance','category_reviews']) t),
  'the three category tables are select-only for authenticated and closed to anon'
);
select ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity) from pg_class c
   where c.oid in ('public.category_parents'::regclass, 'public.category_provenance'::regclass, 'public.category_reviews'::regclass)),
  'RLS is enabled and forced on the three category tables'
);
select ok(
  not has_function_privilege('anon', 'public.set_category_parent(uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.review_transaction_category(uuid,integer)', 'execute')
    and not has_function_privilege('anon', 'public.apply_category_proposals(jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.apply_category_proposals(jsonb)', 'execute'),
  'anon can call none of the category functions; authenticated can'
);

-- 2. The owner's editor.
select lives_ok(
  $$select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000041', 0,
    '{"category_id":"cafecafe-0000-4000-8000-000000000001","note":"invented"}')$$,
  'the owner sets a category'
);
select results_eq(
  $$select overlay_revision, source, detail from public.category_provenance where transaction_id = 'dddddddd-0000-4000-8000-000000000041'$$,
  $$values (1, 'owner'::text, '{}'::jsonb)$$,
  'an owner category edit records owner provenance at the new revision'
);
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000041', 1,
  '{"category_id":"cafecafe-0000-4000-8000-000000000001","note":"invented again"}');
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000042', 0,
  '{"include_in_reporting":false,"note":"invented own transfer"}');
select is(
  (select count(*)::integer from public.category_provenance
   where transaction_id in ('dddddddd-0000-4000-8000-000000000041', 'dddddddd-0000-4000-8000-000000000042')),
  1,
  'an edit that does not change the category records no provenance'
);

-- 3. Proposals.
create temporary table first_batch as select jsonb_build_array(
  jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000041', 'category_id', 'cafecafe-0000-4000-8000-000000000002', 'source', 'rule', 'detail', jsonb_build_object('rule_id', 'r1')),
  jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000042', 'category_id', 'cafecafe-0000-4000-8000-000000000001', 'source', 'match', 'detail', jsonb_build_object('kind', 'transfer')),
  jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000043', 'category_id', 'cafecafe-0000-4000-8000-000000000001', 'source', 'rule', 'detail', jsonb_build_object('rule_id', 'r2')),
  jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000044', 'category_id', 'cafecafe-0000-4000-8000-000000000003', 'source', 'rule', 'detail', jsonb_build_object('rule_id', 'r3')),
  jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000045', 'category_id', 'cafecafe-0000-4000-8000-000000000001', 'source', 'rule', 'detail', jsonb_build_object('rule_id', 'r4'))
) as value;
insert into seq_mark values ('before_first', pg_temp.seq());
select is(
  public.apply_category_proposals((select value from first_batch)),
  '{"applied":2,"skipped":3}'::jsonb,
  'two proposals apply; owner, archived and legacy are skipped'
);
select is(pg_temp.seq(), (select value + 1 from seq_mark where label = 'before_first'), 'one sequence step for the whole call');
select results_eq(
  $$select category_id, include_in_reporting, note, revision from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000042'$$,
  $$values ('cafecafe-0000-4000-8000-000000000001'::uuid, false, 'invented own transfer'::text, 2)$$,
  'a proposal keeps include_in_reporting = false and the note'
);
select is(
  (select category_id from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000041'),
  'cafecafe-0000-4000-8000-000000000001'::uuid,
  'a proposal never overwrites the owner''s category'
);
select is(
  (select category_id from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000045'),
  'cafecafe-0000-4000-8000-000000000002'::uuid,
  'a proposal never overwrites a category with no provenance (legacy, read as the owner''s)'
);
select is(
  (select count(*)::integer from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000044'),
  0,
  'an archived category is skipped'
);
select results_eq(
  $$select o.category_id, o.include_in_reporting, o.revision, p.source, p.detail
    from public.transaction_overlays o join public.category_provenance p on p.transaction_id = o.transaction_id and p.overlay_revision = o.revision
    where o.transaction_id = 'dddddddd-0000-4000-8000-000000000043'$$,
  $$values ('cafecafe-0000-4000-8000-000000000001'::uuid, true, 1, 'rule'::text, '{"rule_id":"r2"}'::jsonb)$$,
  'a row with no overlay gets revision 1, reporting on, and the proposal''s provenance'
);
select ok(
  exists(select 1 from public.overlay_revisions where transaction_id = 'dddddddd-0000-4000-8000-000000000043' and revision = 1
    and changed_by = '11111111-1111-4111-8111-111111111111' and snapshot->>'category_id' = 'cafecafe-0000-4000-8000-000000000001'),
  'a proposal writes the revision snapshot, changed by the owner'
);
select is(
  (select detail from public.audit_events where entity_id = 'dddddddd-0000-4000-8000-000000000043' and event_type = 'overlay.updated'),
  '{"revision":1,"source":"rule"}'::jsonb,
  'a proposal writes an overlay.updated audit event with its source'
);

insert into seq_mark values ('before_rerun', pg_temp.seq());
select is(
  public.apply_category_proposals((select value from first_batch)),
  '{"applied":0,"skipped":5}'::jsonb,
  'the same proposals again write nothing'
);
select is(pg_temp.seq(), (select value from seq_mark where label = 'before_rerun'), 'a call that applies nothing does not step the sequence');
select is(
  (select max(revision) from public.overlay_revisions where transaction_id = 'dddddddd-0000-4000-8000-000000000042'),
  2,
  'a re-run adds no overlay revision'
);

select is(
  public.apply_category_proposals(jsonb_build_array(jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000043',
    'category_id', 'cafecafe-0000-4000-8000-000000000002', 'source', 'match', 'detail', '{}'::jsonb))),
  '{"applied":1,"skipped":0}'::jsonb,
  'one machine source may replace another'
);
select results_eq(
  $$select overlay_revision, source from public.category_provenance where transaction_id = 'dddddddd-0000-4000-8000-000000000043' order by overlay_revision$$,
  $$values (1, 'rule'::text), (2, 'match'::text)$$,
  'the replacement appends a provenance row'
);

select throws_ok(
  $$select public.apply_category_proposals('[{"transaction_id":"not-a-uuid","category_id":"cafecafe-0000-4000-8000-000000000001","source":"rule","detail":{}}]')$$,
  'invalid category proposal', 'a malformed item raises'
);
select throws_ok(
  $$select public.apply_category_proposals('[{"transaction_id":"dddddddd-0000-4000-8000-000000000041","category_id":"cafecafe-0000-4000-8000-000000000001","source":"owner","detail":{}}]')$$,
  'invalid category proposal', 'a proposal cannot claim the owner source'
);
select throws_ok(
  $$select public.apply_category_proposals((select jsonb_agg(jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000041', 'category_id', 'cafecafe-0000-4000-8000-000000000001', 'source', 'rule', 'detail', '{}'::jsonb)) from generate_series(1, 5001)))$$,
  'too many category proposals', 'more than 5000 items raises'
);
select throws_ok(
  $$select public.apply_category_proposals('[{"transaction_id":"dddddddd-0000-4000-8000-000000000099","category_id":"cafecafe-0000-4000-8000-000000000001","source":"rule","detail":{}}]')$$,
  'transaction not owned', 'a transaction that is not the owner''s raises'
);

-- 4. Reviews.
select throws_ok(
  $$select public.review_transaction_category('dddddddd-0000-4000-8000-000000000043', 1)$$,
  'not the latest category provenance', 'only the latest provenance row can be reviewed'
);
select throws_ok(
  $$select public.review_transaction_category('dddddddd-0000-4000-8000-000000000041', 1)$$,
  'owner category needs no review', 'an owner category cannot be reviewed'
);
select throws_ok(
  $$select public.review_transaction_category('dddddddd-0000-4000-8000-000000000046', 1)$$,
  'no category to review', 'a null category cannot be reviewed'
);
insert into seq_mark values ('before_review', pg_temp.seq());
select is(
  public.review_transaction_category('dddddddd-0000-4000-8000-000000000043', 2)->>'changed',
  'true', 'the latest machine category is reviewed'
);
select is(
  public.review_transaction_category('dddddddd-0000-4000-8000-000000000043', 2)->>'changed',
  'false', 'reviewing again changes nothing'
);
select ok(
  pg_temp.seq() = (select value + 1 from seq_mark where label = 'before_review')
    and (select count(*) from public.category_reviews where transaction_id = 'dddddddd-0000-4000-8000-000000000043') = 1
    and (select count(*) from public.audit_events where entity_id = 'dddddddd-0000-4000-8000-000000000043' and event_type = 'category.reviewed') = 1,
  'two reviews write one row, one audit event and one sequence step'
);
select is(
  public.apply_category_proposals(jsonb_build_array(jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000043',
    'category_id', 'cafecafe-0000-4000-8000-000000000001', 'source', 'model', 'detail', '{}'::jsonb))),
  '{"applied":0,"skipped":1}'::jsonb,
  'a proposal never overwrites a reviewed category'
);

-- 5. Parents.
insert into seq_mark values ('before_parent', pg_temp.seq());
select is(
  public.set_category_parent('cafecafe-0000-4000-8000-000000000004', 'cafecafe-0000-4000-8000-000000000001')->>'changed',
  'true', 'a category takes a parent'
);
select ok(
  pg_temp.seq() = (select value + 1 from seq_mark where label = 'before_parent')
    and exists(select 1 from public.audit_events where entity_id = 'cafecafe-0000-4000-8000-000000000004'
      and event_type = 'category.parent_set' and detail = '{"parent_id":"cafecafe-0000-4000-8000-000000000001"}'),
  'setting a parent is audited and steps the sequence'
);
select is(
  public.set_category_parent('cafecafe-0000-4000-8000-000000000004', 'cafecafe-0000-4000-8000-000000000001')->>'changed',
  'false', 'setting the same parent again changes nothing'
);
select throws_ok(
  $$select public.set_category_parent('cafecafe-0000-4000-8000-000000000005', 'cafecafe-0000-4000-8000-000000000004')$$,
  'parent category already has a parent', 'only one level: a child cannot be a parent'
);
select throws_ok(
  $$select public.set_category_parent('cafecafe-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000005')$$,
  'category has children', 'a category with children cannot take a parent'
);
select throws_ok(
  $$select public.set_category_parent('cafecafe-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000004')$$,
  'parent category already has a parent', 'no cycle: a parent cannot go under its own child'
);
select throws_ok(
  $$select public.set_category_parent('cafecafe-0000-4000-8000-000000000005', 'cafecafe-0000-4000-8000-000000000005')$$,
  'category cannot be its own parent', 'a category cannot be its own parent'
);
select throws_ok(
  $$select public.set_category_parent('cafecafe-0000-4000-8000-000000000005', 'cafecafe-0000-4000-8000-000000000003')$$,
  'parent category is archived', 'an archived category cannot be a parent'
);
select throws_ok(
  $$select public.set_category_parent('cafecafe-0000-4000-8000-000000000005', 'cafecafe-0000-4000-8000-000000000099')$$,
  'parent category not owned', 'the parent must be owned'
);
select is(
  public.set_category_parent('cafecafe-0000-4000-8000-000000000004', null)->>'changed',
  'true', 'a null parent removes the link'
);
select is((select count(*)::integer from public.category_parents), 0, 'the link is gone');

-- 5b. An owner's clear is a decision.
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000047', 0, '{"category_id":"cafecafe-0000-4000-8000-000000000001"}');
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000047', 1, '{}');
select is(
  public.apply_category_proposals(jsonb_build_array(jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000047',
    'category_id', 'cafecafe-0000-4000-8000-000000000002', 'source', 'rule', 'detail', '{}'::jsonb))),
  '{"applied":0,"skipped":1}'::jsonb,
  'a proposal never refills a category the owner cleared'
);

-- 5c. The Auto-excluded label survives category-only revisions, not an owner's toggle.
select is(public.auto_exclude_internal_transfers()->>'pairs', '1', 'the invented own transfer is auto-excluded');
-- Separate statements: the stable list function would otherwise read the snapshot from before
-- the proposal's write.
select public.apply_category_proposals(jsonb_build_array(jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000048',
  'category_id', 'cafecafe-0000-4000-8000-000000000001', 'source', 'match', 'detail', '{}'::jsonb)));
select ok(
  (select revision from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000048') = 2
    and public.list_auto_excluded_transactions() ? 'dddddddd-0000-4000-8000-000000000048',
  'a machine category (a new revision) keeps the Auto-excluded label'
);
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000049', 1,
  '{"category_id":"cafecafe-0000-4000-8000-000000000002","include_in_reporting":false}');
select ok(
  public.list_auto_excluded_transactions() ? 'dddddddd-0000-4000-8000-000000000049',
  'an owner category edit that leaves reporting off keeps the label'
);
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000048', 2,
  '{"category_id":"cafecafe-0000-4000-8000-000000000001","include_in_reporting":true}');
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000048', 3,
  '{"category_id":"cafecafe-0000-4000-8000-000000000001","include_in_reporting":false}');
select ok(
  not (public.list_auto_excluded_transactions() ? 'dddddddd-0000-4000-8000-000000000048'),
  'an owner toggle of reporting drops the label, even when toggled back off'
);

-- 5d. The auto-categoriser's inputs. An overlay description wins over the source's; a parent shows.
select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000049', 2,
  '{"category_id":"cafecafe-0000-4000-8000-000000000002","include_in_reporting":false,"description":"INVENTED OVERLAY NAME"}');
select public.set_category_parent('cafecafe-0000-4000-8000-000000000004', 'cafecafe-0000-4000-8000-000000000001');
create temp table category_inputs on commit drop as
  select value as row from jsonb_array_elements(public.list_category_inputs()->'transactions');
select is(
  (select count(*)::integer from category_inputs),
  (select count(*)::integer from public.source_transactions where owner_id = '11111111-1111-4111-8111-111111111111'),
  'list_category_inputs returns every transaction once'
);
select is(
  (select row - 'id' from category_inputs where row->>'id' = 'dddddddd-0000-4000-8000-000000000048'),
  '{"amount_minor":"-77700","description":"INVENTED TRANSFER OUT","transaction_label":"Invented transfer","include_in_reporting":false,"category_id":"cafecafe-0000-4000-8000-000000000001","source":"match","reviewed":false}'::jsonb,
  'an excluded row reads its amount as text, its category and its latest (machine) source'
);
select is(
  (select row->>'description' from category_inputs where row->>'id' = 'dddddddd-0000-4000-8000-000000000049'),
  'INVENTED OVERLAY NAME', 'the overlay description wins over the source one'
);
select ok(
  (select (row->>'reviewed')::boolean and row->>'source' = (select source from public.category_provenance where transaction_id = 'dddddddd-0000-4000-8000-000000000043' order by overlay_revision desc limit 1) from category_inputs where row->>'id' = 'dddddddd-0000-4000-8000-000000000043'),
  'a reviewed machine category reads as reviewed'
);
select ok(
  (select row->>'source' is null and row->>'category_id' = 'cafecafe-0000-4000-8000-000000000002' and not (row->>'reviewed')::boolean
     from category_inputs where row->>'id' = 'dddddddd-0000-4000-8000-000000000045'),
  'a legacy category reads with no source'
);
select ok(
  (select row->>'category_id' is null and (row->>'include_in_reporting')::boolean and row->>'source' is null
     from category_inputs where row->>'id' = 'dddddddd-0000-4000-8000-000000000044'),
  'an untouched row reads uncategorised and reported'
);
select is(
  (select c->>'parent_id' from jsonb_array_elements(public.list_category_inputs()->'categories') c
    where c->>'id' = 'cafecafe-0000-4000-8000-000000000004'),
  'cafecafe-0000-4000-8000-000000000001', 'a category reads with its parent'
);
select ok(
  not has_function_privilege('anon', 'public.list_category_inputs()', 'execute')
    and has_function_privilege('authenticated', 'public.list_category_inputs()', 'execute'),
  'anon cannot read the categoriser inputs'
);

-- 5e. The ledger row carries where its category came from (step 4).
select public.apply_category_proposals(jsonb_build_array(jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000044',
  'category_id', 'cafecafe-0000-4000-8000-000000000004', 'source', 'rule', 'detail', '{"rule":"invented"}'::jsonb)));
create temp table ledger_rows on commit drop as
  select t.id, private.ledger_transaction_json('11111111-1111-4111-8111-111111111111', t) as row
  from public.source_transactions t where t.owner_id = '11111111-1111-4111-8111-111111111111';
select is(
  (select jsonb_build_object('s', row->'category_source', 'r', row->'category_source_revision', 'v', row->'category_reviewed', 'p', row->'category_parent_name')
     from ledger_rows where id = 'dddddddd-0000-4000-8000-000000000044'),
  '{"s":"rule","r":1,"v":false,"p":"Invented Food"}'::jsonb,
  'a machine subcategory reads its source, revision, not reviewed, and its parent''s name'
);
select is(
  (select jsonb_build_object('s', row->'category_source', 'r', row->'category_source_revision', 'v', row->'category_reviewed', 'p', row->'category_parent_name')
     from ledger_rows where id = 'dddddddd-0000-4000-8000-000000000043'),
  jsonb_build_object('s', (select source from public.category_provenance where transaction_id = 'dddddddd-0000-4000-8000-000000000043' order by overlay_revision desc limit 1),
    'r', 2, 'v', true, 'p', null),
  'a reviewed machine category reads as reviewed, with no parent at the top level'
);
select is(
  (select jsonb_build_object('s', row->'category_source', 'r', row->'category_source_revision', 'v', row->'category_reviewed', 'p', row->'category_parent_name')
     from ledger_rows where id = 'dddddddd-0000-4000-8000-000000000045'),
  '{"s":null,"r":null,"v":false,"p":null}'::jsonb,
  'a legacy category reads with no source'
);
select is(
  (select array_agg(k order by k) from ledger_rows, jsonb_object_keys(row) k where id = 'dddddddd-0000-4000-8000-000000000044'),
  array['branch','category_parent_name','category_reviewed','category_source','category_source_revision','currency',
        'description','effective_date','id','post_balance_minor','reference','source_components','source_date',
        'source_time','transaction_label','transaction_overlays'],
  'the row keeps every earlier key and adds exactly the four category ones'
);

-- 6. Another signed-in user and anon are refused.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$select public.list_category_inputs()$$,
  'strong owner access required', 'another user cannot read the categoriser inputs'
);
select throws_ok(
  $$select public.apply_category_proposals('[]')$$,
  'strong owner access required', 'another user cannot apply proposals'
);
select throws_ok(
  $$select public.review_transaction_category('dddddddd-0000-4000-8000-000000000043', 2)$$,
  'strong owner access required', 'another user cannot review'
);
select throws_ok(
  $$select public.set_category_parent('cafecafe-0000-4000-8000-000000000004', 'cafecafe-0000-4000-8000-000000000001')$$,
  'strong owner access required', 'another user cannot set a parent'
);
set local role authenticated;
select is(
  (select count(*)::integer from public.category_provenance) + (select count(*)::integer from public.category_reviews),
  0, 'another user sees no provenance or reviews'
);
reset role;

-- 7. Append-only.
select throws_ok(
  $$update public.category_provenance set source = 'model'$$,
  'category_provenance is append-only: UPDATE is forbidden', 'provenance refuses update'
);
select throws_ok(
  $$delete from public.category_provenance$$,
  'category_provenance is append-only: DELETE is forbidden', 'provenance refuses delete'
);
select throws_ok(
  $$delete from public.category_reviews$$,
  'category_reviews is append-only: DELETE is forbidden', 'reviews refuse delete'
);

select * from finish();
rollback;

-- Take back the privileges Supabase's own defaults hand to `anon` and `authenticated` on every
-- new object in `public` (PLAN task 31, D-106).
--
-- ## What was wrong, and why nothing in this repository showed it
--
-- Supabase's bootstrap runs `alter default privileges in schema public` granting `Dxtm` —
-- `truncate`, `references`, `trigger`, `maintain` — to `anon`, `authenticated` and `service_role`
-- on every **future** table created by `postgres`, plus `update` on every future sequence.
-- Migration 002 cleans that up with `revoke all on all tables in schema public from anon,
-- authenticated`, and that form is expanded by PostgreSQL **at execution time** over the tables
-- then existing. It therefore cleaned up 001–002's tables and reached nothing created afterwards.
-- **No migration between 003 and 017 repeated it.**
--
-- So thirteen tables — every `slips`, `slip_match_*`, `slip_correction_*`, `cash_entr*` and
-- `notification_card*` table — carried `truncate` for `anon`, and `audit_events_id_seq` carried
-- `update`. **`truncate` bypasses row-level security**: policies are not consulted for it, so the
-- grant would empty a ledger table outright, and `update` on the audit sequence permits `setval`
-- against the append-only trail the audit invariant rests on.
--
-- **This was never reachable from the internet**, which is why it is a hardening change rather
-- than an incident. PostgREST maps no HTTP verb to `truncate` or to `setval`, nothing in this
-- application runs caller-influenced SQL, and the publishable key is a PostgREST token rather than
-- a database credential — holding it does not open a session as the `anon` **database** role. What
-- is being closed is the day some future path does run SQL as `anon`.
--
-- **The revokes in migrations 011 … 017 were no-ops and should not be read as protection.** Each
-- says `revoke insert, update, delete ... from authenticated, anon`, and the defaults never granted
-- `insert`, `update` or `delete` on tables. Those three were safe because they were never given,
-- not because of the line that appears to withhold them. The lines stay — they are still the guard
-- against a future blanket grant — but they were answering a question nobody had asked.
--
-- ## Why this repeats migration 002's pair rather than naming the privileges
--
-- `revoke all` + `grant select` is exactly what 002 does, and it is deliberately **not** written as
-- `revoke truncate, references, trigger, maintain`. Naming them would hard-code a privilege list
-- that changes with the PostgreSQL version — `maintain` does not exist before 17, so a named revoke
-- would be a syntax error on any older server, and this migration has to apply to a hosted project
-- whose version is not verified from here. `all` is version-agnostic and cannot go stale.
--
-- It is safe to swing that wide because the ledger's steady state is already narrow, measured
-- before writing this rather than assumed: `authenticated` holds **`select` on all 28 public tables
-- and no write on any of them**, and `anon` holds no `select` anywhere. So the re-grant below
-- restores the whole intended posture, and the net change is the removal of `truncate`,
-- `references`, `trigger` and `maintain`.
--
-- ## What is deliberately left alone
--
--   * **`service_role`.** It is the bypass-everything role by design. Nothing in this repository
--     reads `SUPABASE_SERVICE_ROLE_KEY` and the deployment deliberately does not set it, so its
--     defaults are out of scope rather than overlooked.
--   * **Functions.** Every RPC already carries its own `revoke all ... from public, anon` beside
--     its definition, and those are real rather than inherited.
--
-- ## No backup version bump
--
-- This adds no table and no column, so `export_backup_snapshot` and `restore_backup` are untouched
-- and the contract stays at **v7** reading v2 … v7. D-097's rule is about new owner data; a grant
-- is not owner data. A migration that moved the version without adding a table would strand files
-- for nothing.

begin;

-- Tables: take everything back, then hand `select` straight back to the reader that needs it.
-- Order matters only inside this transaction, and both statements expand over the same 28 tables.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

-- Sequences: `audit_events_id_seq` is the only one, and neither role needs it. Every write path is
-- a `security definer` function running as the owner, so the caller's own privileges are never what
-- advances a sequence.
revoke all on all sequences in schema public from anon, authenticated;

-- The part that stops this recurring. Without it the next migration to add a table reintroduces
-- exactly the state this one is removing, and the next security review finds it again. `postgres`
-- is the role that creates objects here, so these are the defaults that matter.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;

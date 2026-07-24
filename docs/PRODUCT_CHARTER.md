# Product charter and roadmap

## Charter

Build a private single-owner ledger that imports only a verified Krungthai PDF contract, keeps sensitive document material in browser memory, persists immutable source facts behind restrictive RLS, and makes recovery possible before any real data is accepted.

## Local milestone

1. Exact-money and canonical import contracts.
2. Synthetic PDF/row fixtures, review, reconciliation, confirmation, overlays, and categories.
3. Atomic PostgreSQL import, AAL2/two-TOTP RLS, audit history, and immutable facts.
4. Encrypted portable export and atomic empty-ledger restore.
5. Unit, property, pgTAP, browser, accessibility, and privacy acceptance on a clean local reset.

## Later milestones

Only after local acceptance: create an empty Singapore Supabase Free project, dry-run and apply committed migrations, configure Google OAuth, bind the owner, enroll two TOTP factors, deploy a Vercel preview in Singapore, run hosted security/recovery smoke tests, and promote the exact verified revision.

No schema changes are made in a hosted dashboard. Migrations are the source of truth. No synthetic database rows move to hosted environments.

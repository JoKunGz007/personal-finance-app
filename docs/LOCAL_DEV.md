# Local development & validation

System Node is v20. Use the ignored project-local runtime in PowerShell before any `pnpm` command:

```powershell
$nodeDir = "D:\Projects\personal-finance-app\.runtime\node-v24.18.0-win-x64"
$env:PATH = "$nodeDir;$env:PATH"
$env:COREPACK_HOME = "D:\Projects\personal-finance-app\.runtime\corepack"
pnpm --version
```

A clean frozen install succeeds offline after explicitly allowing build scripts only for `esbuild`, `sharp`, `supabase`, and `unrs-resolver`.

## Validation order

```powershell
pnpm install --frozen-lockfile --offline
pnpm lint
pnpm typecheck
pnpm test
pnpm supabase:reset
pnpm supabase:test
pnpm build
pnpm exec playwright test --config=playwright.isolated.config.ts
pnpm exec playwright test --config=playwright.owner.config.ts
```

Use the isolated config rather than `pnpm test:e2e`: the default one reuses a server someone else left running, so a browser run can silently test stale code (D-027).

The owner config is a second browser suite, for the specs that need a signed-in owner — the binding chooser, the authenticated import path, and the charset rejection path. It builds with `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1`, which is what makes the development sign-in exist at all (D-036); no other build has it. Both browser suites and `pnpm test` share one database and one owner, and all three want an account ending 7890, so each cleans up after itself — see GOTCHAS if you meet a `accounts_owner_id_bank_code_last_four_key` violation.

The masking harness is run on demand, never as part of validation, and needs the owner present to type a document password:

```powershell
node scripts/mask-statement.mjs private-statements/<file>.pdf --label <format>
```

## Docker / Supabase acceptance

Docker acceptance uses only the `private-ledger-local` Supabase project on `supabase_network_private-ledger-local` (its default Docker network — see `DECISIONS.md` D-008, D-009). Do not modify the older PostgreSQL/pgAdmin containers or the Windows PostgreSQL service.

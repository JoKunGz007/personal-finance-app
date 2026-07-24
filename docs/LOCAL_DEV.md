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
pnpm test:e2e
```

## Docker / Supabase acceptance

Docker acceptance uses only the `private-ledger-local` Supabase project on `supabase_network_private-ledger-local` (its default Docker network — see `DECISIONS.md` D-008, D-009). Do not modify the older PostgreSQL/pgAdmin containers or the Windows PostgreSQL service.

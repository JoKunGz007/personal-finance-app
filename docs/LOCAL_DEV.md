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

## Three Supabase projects, and which is which

| Project | Ports | Holds | `down` |
| --- | --- | --- | --- |
| `private-ledger-local` | 5432x | Synthetic seed only. **Every suite, seed and pgTAP fixture targets this.** Disposable | `pnpm supabase:stop` |
| `private-ledger-recovery` | 5433x | Nothing; a destination for proving a backup restores | discards its data |
| `private-ledger-live` | 5434x | **Real financial records** (D-048). Studio on 54343 | preserves its data |

```powershell
node scripts/live-ledger.mjs up      # start / migrate / bind
node scripts/live-ledger.mjs status  # what is actually in there
node scripts/live-ledger.mjs down    # stop, data preserved
```

Point the app at the live ledger by setting `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54341` in `.env.local`. The browser suites pin the test project explicitly, so a `.env.local` aimed at the live ledger cannot drag them onto real data.

**Never run the suites against the live ledger.** The wipes in `tests/helpers/local-owner.ts` are owner-scoped, not test-scoped, so they delete every row the owner has. `assertOnlyDisposableLedgerData` refuses when it finds an account neither the seed nor the suite created; `pnpm supabase:reset` cannot be guarded at all.

`tests/recovery-portability.test.ts` skips unless the recovery project is also running, and a skipped run proves nothing about recovery. Start it first, and stop it afterwards — it is disposable by design:

```powershell
node scripts/recovery-destination.mjs up
node scripts/recovery-destination.mjs down
```

See `docs/RECOVERY.md` § Portable recovery rehearsal for what it does and does not establish.

The masking harness is run on demand, never as part of validation, and needs the owner present to type a document password:

```powershell
node scripts/mask-statement.mjs private-statements/<folder> --label <format>
```

It takes a directory or a single PDF. For a directory it walks every PDF beneath it, asks for the password **once** and reuses it, re-asking only for a document that one does not open, and writes `<format>-01.md`, `<format>-02.md`, … in sorted order. File names are masked in both the dumps and the console output, so no real name is typed or read (D-035).

## Docker / Supabase acceptance

Docker acceptance uses only the `private-ledger-local` Supabase project on `supabase_network_private-ledger-local` (its default Docker network — see `DECISIONS.md` D-008, D-009). Do not modify the older PostgreSQL/pgAdmin containers or the Windows PostgreSQL service.

# Database schema

`supabase/migrations/` is the only source of truth for the database schema.
The old hand-run `supabase/schema.sql` was removed; everything it contained is in
`202610010001_baseline_legacy_tables.sql` (plus the later migrations).

## Rules

- Change the schema only by adding a new migration file. Never edit the schema by
  hand in the Supabase dashboard.
- Every migration must be idempotent (`if not exists`, `create or replace`,
  `drop policy if exists` ...). Production was historically patched by hand, so a
  migration may run against a database that already has part of it.
- Never drop or truncate price data (`price_history`).
- When a migration adds/changes/removes a column, update
  `supabase/snapshot/columns.csv` in the same PR.

## Fresh database

```bash
supabase db start          # local Postgres, applies supabase/migrations/ in order
./scripts/check-schema-drift.sh
```

## CI drift check (`schema-drift` job in `.github/workflows/ci.yml`)

1. `supabase db start` builds a throwaway database from migrations only.
2. `scripts/check-schema-drift.sh` re-applies every migration (idempotency) and
   diffs public columns, RLS policies and indexes with `supabase/snapshot/`
   (`columns.csv`, `policies.txt`, `indexes.txt`; queries in `scripts/sql/`).
3. `supabase db lint` checks database functions; a `pg_dump` is uploaded as an artifact.

No production secrets are used. To refresh the snapshot from the live project, run
this read-only query in the SQL editor and save the result as `columns.csv`:

```sql
select c.table_name||','||c.column_name||','||c.data_type||','||c.is_nullable
from information_schema.columns c
join information_schema.tables t using (table_schema, table_name)
where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by 1;
```

## Before pushing to production (baseline migration)

`202610010001_baseline_legacy_tables.sql` is dated *before* migrations that were
already applied to production by hand, and production's migration history does not
contain it. Its statements are no-ops there, but `supabase db push` would refuse because it is
older than the last applied migration. Mark it applied first (records history only,
runs no SQL):

```bash
supabase migration repair --status applied 202610010001
```

Production's history currently lists only `20261022155804` (the SQL Editor version of
`202610220001`); the other files were also run by hand. Run `supabase migration list`
first; if they are missing too, record them the same way:

```bash
supabase migration repair --status applied 202610150001 202610150002 202610170001 202610170002 202610220001
supabase migration repair --status reverted 20261022155804   # remote-only duplicate
```

Do **NOT** use `supabase db push --include-all`: it would re-run the baseline and the
other hand-applied migrations against production.

## Aligning local and remote migration history (`supabase migration repair`)

Migrations applied live with the Supabase MCP `apply_migration` tool are recorded in
`supabase_migrations.schema_migrations` under a generated 14-digit timestamp, not the
12-digit prefix of the file in `supabase/migrations/`. Files can also be renamed later
to avoid prefix clashes (for example PR #7's demo migrations moved to `202610290005`
and `202610290006` because hotfix PR #8 uses `202610290002` and `202610290004`).
`supabase db push` / `supabase migration list` then report the remote rows as unknown
and the local files as pending.

`migration repair` only edits history rows. It never runs or reverts SQL, so it does
not touch data (including `price_history`).

1. Compare: `supabase migration list --linked`
2. Mark the remote-only rows as reverted (history row only, schema unchanged):
   `supabase migration repair --status reverted 20261029025826 20261029030627`
3. Mark the matching local files as applied, without running them:
   `supabase migration repair --status applied 202610290005 202610290006`
4. Re-run `supabase migration list --linked`. Every version should now show on both sides.

The versions above are the PR #7 demo migrations (`demo_read_only_account`,
`demo_slug_demo_shop`). For any other migration, look up its remote version with
`select version, name from supabase_migrations.schema_migrations order by version;`
and pair it with its file by name. Only repair a version whose SQL really is live.
Otherwise `db push` would skip a migration that never ran.

## Snapshot = intended state

The snapshots describe what the migrations build, not necessarily production.
Known difference (2026-10-29): production still has five legacy policies created
by hand — "Allow public insert" on `products`/`tracked_links` and "Allow public
read" on `products`/`tracked_links`/`price_history`. They are not in any migration
or snapshot; `202610290001_drop_legacy_public_policies.sql` drops them (until it is
applied to production, production keeps them).

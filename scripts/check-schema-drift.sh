#!/usr/bin/env bash
# Schema drift check. Expects a database built only from supabase/migrations/
# (e.g. `supabase db start`). Needs no production secrets.
#   1. Re-applies every migration a second time: they must be idempotent,
#      because production was historically patched by hand.
#   2. Compares public tables/columns with supabase/snapshot/columns.csv,
#      a snapshot of the live project. Any difference fails the job.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
cd "$(dirname "$0")/.."

echo "== Re-applying migrations (idempotency check)"
for f in supabase/migrations/*.sql; do
  echo "-- $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done

echo "== Comparing columns with supabase/snapshot/columns.csv"
actual=$(mktemp)
psql "$DB_URL" -At -F, -c "
  select c.table_name, c.column_name, c.data_type, c.is_nullable
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
  " | LC_ALL=C sort > "$actual"
expected=$(mktemp)
LC_ALL=C sort supabase/snapshot/columns.csv > "$expected"

if diff -u "$expected" "$actual"; then
  echo "No schema drift."
else
  echo "::error::Schema drift: migrations do not match supabase/snapshot/columns.csv." >&2
  echo "If the change is intended, update the snapshot in the same PR." >&2
  exit 1
fi

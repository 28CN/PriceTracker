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

status=0
compare() { # name, snapshot file, query
  local actual expected
  actual=$(mktemp); expected=$(mktemp)
  psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "$3" | LC_ALL=C sort > "$actual"
  LC_ALL=C sort "$2" > "$expected"
  echo "== Comparing $1 with $2"
  if diff -u "$expected" "$actual"; then
    echo "   $1: no drift"
  else
    echo "::error::Schema drift in $1: migrations do not match $2. If intended, update the snapshot in the same PR." >&2
    status=1
  fi
}

compare columns supabase/snapshot/columns.csv "
  select c.table_name||','||c.column_name||','||c.data_type||','||c.is_nullable
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'"
compare policies supabase/snapshot/policies.txt "$(cat scripts/sql/policies.sql)"
compare indexes supabase/snapshot/indexes.txt "$(cat scripts/sql/indexes.sql)"
compare function_privileges supabase/snapshot/function_privileges.txt "$(cat scripts/sql/function_privileges.sql)"

if [ "$status" -eq 0 ]; then echo "No schema drift."; fi
exit "$status"

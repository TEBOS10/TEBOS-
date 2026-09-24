#!/usr/bin/env bash
# Applies the TEBOS migrations to a scratch database and runs the SQL test
# suite. Needs a Postgres 15+ server; point TEBOS_TEST_PG at it, e.g.
#   TEBOS_TEST_PG="-h localhost -p 5432 -U postgres" npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

PG="${TEBOS_TEST_PG:--h localhost -U postgres}"
DB="tebos_test_$$"

psql $PG -v ON_ERROR_STOP=1 -qX -d postgres -c "create database $DB" >/dev/null
trap 'psql $PG -qX -d postgres -c "drop database if exists $DB" >/dev/null' EXIT

run() { psql $PG -v ON_ERROR_STOP=1 -qX -d "$DB" -f "$1" >/dev/null; }

run supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
for f in supabase/tests/[1-9]*.sql; do
  echo "• $(basename "$f")"
  psql $PG -v ON_ERROR_STOP=1 -qX -d "$DB" -f "$f" >/dev/null
done
echo "database tests passed"

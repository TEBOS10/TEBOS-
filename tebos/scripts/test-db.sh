#!/usr/bin/env bash
# Applies the TEBOS migrations to a scratch database, runs the SQL rule tests,
# then runs the Postgres integration tests (acquisition worker) against it.
# Needs a Postgres 15+ server, addressed with the standard libpq variables:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-postgres}"
DB="tebos_test_$$"

psql -v ON_ERROR_STOP=1 -qX -d postgres -c "create database $DB" >/dev/null
trap 'psql -qX -d postgres -c "drop database if exists $DB" >/dev/null' EXIT

run() { psql -v ON_ERROR_STOP=1 -qX -d "$DB" -f "$1" >/dev/null; }

run supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
for f in supabase/tests/[1-9]*.sql; do
  echo "• $(basename "$f")"
  run "$f"
done

echo "• integration tests"
PGDATABASE="$DB" TEBOS_TEST_DB=1 npx vitest run test/integration
echo "database tests passed"

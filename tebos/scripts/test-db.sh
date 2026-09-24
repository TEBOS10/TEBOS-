#!/usr/bin/env bash
# Applies the TEBOS migrations to scratch databases and runs:
#   1. the SQL rule tests (supabase/tests)
#   2. the Postgres integration tests (the evidence pipeline), in a separate
#      fresh database so the rule tests' leftovers cannot interfere
# Needs a Postgres 15+ server, addressed with the standard libpq variables:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-postgres}"
RULES_DB="tebos_rules_$$"
PIPELINE_DB="tebos_pipeline_$$"

cleanup() {
  for db in "$RULES_DB" "$PIPELINE_DB"; do psql -qX -d postgres -c "drop database if exists $db" >/dev/null; done
}
trap cleanup EXIT

run() { psql -v ON_ERROR_STOP=1 -qX -d "$1" -f "$2" >/dev/null; }

fresh_db() {
  psql -v ON_ERROR_STOP=1 -qX -d postgres -c "create database $1" >/dev/null
  run "$1" supabase/tests/00_supabase_stub.sql
  for f in supabase/migrations/*.sql; do run "$1" "$f"; done
}

fresh_db "$RULES_DB"
for f in supabase/tests/[1-9]*.sql; do
  echo "• $(basename "$f")"
  run "$RULES_DB" "$f"
done

echo "• integration tests"
fresh_db "$PIPELINE_DB"
PGDATABASE="$PIPELINE_DB" TEBOS_TEST_DB=1 npx vitest run --no-file-parallelism test/integration
echo "database tests passed"

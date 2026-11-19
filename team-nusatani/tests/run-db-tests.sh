#!/usr/bin/env bash
# Runs the database tests against a throw-away local Postgres database.
# Usage: tests/run-db-tests.sh   (needs a local Postgres superuser; default: sudo -u postgres)
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL=${PSQL:-"psql"}
DB=${TEST_DB:-team_nusatani_test}
run() { if [ "$(id -un)" = "root" ]; then su postgres -c "$*"; else eval "$*"; fi; }
run "$PSQL -q -c 'drop database if exists $DB' -c 'create database $DB'" >/dev/null
run "$PSQL -v ON_ERROR_STOP=1 -q -d $DB -f tests/db/00-supabase-stub.sql" >/dev/null 2>&1
run "$PSQL -v ON_ERROR_STOP=1 -q -d $DB -f supabase/migrations/20261119000000_team_nusatani.sql" >/dev/null 2>&1
run "$PSQL -v ON_ERROR_STOP=1 -q -d $DB -f supabase/migrations/20261119000000_team_nusatani.sql" >/dev/null 2>&1  # re-runnable
run "$PSQL -v ON_ERROR_STOP=1 -d $DB -f tests/db/10-tests.sql 2>&1 >/dev/null" | sed -e 's/^psql:[^ ]* NOTICE:  //'
run "$PSQL -q -c 'drop database if exists $DB'" >/dev/null
echo "All database tests passed."

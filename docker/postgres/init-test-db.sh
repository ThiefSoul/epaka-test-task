#!/bin/sh
set -eu

test_db="${DB_TEST_NAME:-epaka_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
SELECT 'CREATE DATABASE "$test_db"'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = '$test_db'
)\gexec
EOSQL

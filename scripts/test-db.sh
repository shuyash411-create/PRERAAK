#!/usr/bin/env bash
# Prepare the local test database. Development only — never point this at a
# deployed database; it applies migrations to a database the test suite
# truncates on every run.
set -euo pipefail

DB_NAME="${TEST_DB_NAME:-preraak_test}"
DB_USER="${TEST_DB_USER:-preraak}"
DB_PASS="${TEST_DB_PASS:-preraak}"
DB_HOST="${TEST_DB_HOST:-127.0.0.1}"
DB_PORT="${TEST_DB_PORT:-5432}"

if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
  echo "Postgres is not accepting connections on $DB_HOST:$DB_PORT."
  echo "Start it first, e.g.  sudo pg_ctlcluster 16 main start"
  exit 1
fi

if ! PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
      -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1; then
  echo "Cannot connect as '$DB_USER' to '$DB_NAME'. Create them with:"
  echo "  sudo -u postgres psql -c \"CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS' CREATEDB;\""
  echo "  sudo -u postgres createdb -O $DB_USER $DB_NAME"
  exit 1
fi

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "Applying migrations to $DB_NAME ..."
npx prisma migrate deploy
echo "Test database ready."

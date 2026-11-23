#!/usr/bin/env bash
# Disposable integration test; caller supplies path to an existing tsx loader.
set -euo pipefail
: "${QA_TSX_LOADER:?set QA_TSX_LOADER to an existing tsx loader}"
qa_container=qa-lease-test-$(date +%s)-$$
cleanup() { docker rm -f "$qa_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
read_sql() { QA_SQL_KEY="$1" node --import "$QA_TSX_LOADER" --input-type=module -e 'import {QA_LEASE_SQL} from "./apps/server/src/rooms/qaDatabaseLease.ts"; process.stdout.write(QA_LEASE_SQL[process.env.QA_SQL_KEY])'; }
identity_sql=$(read_sql identity)
lock_sql=$(read_sql lock)
held_sql=$(read_sql held)
docker run --rm -d --name "$qa_container" -e POSTGRES_PASSWORD=disposable-test -e POSTGRES_DB=qa_test postgres:16-alpine >/dev/null
for i in $(seq 1 60); do if docker exec "$qa_container" pg_isready -h 127.0.0.1 -U postgres -d qa_test >/dev/null 2>&1; then break; fi; sleep 0.2; done
psql_qa() { docker exec -e PGPASSWORD=disposable-test "$qa_container" psql -h 127.0.0.1 -U postgres -d qa_test -At -v ON_ERROR_STOP=1 "$@"; }
psql_qa -c 'CREATE TABLE "QaInstallationIdentity" (singleton boolean PRIMARY KEY, "installationId" uuid NOT NULL); INSERT INTO "QaInstallationIdentity" VALUES (true, '\''992ea8ce-1e2d-4ed8-b841-457fc5b6f384'\'');' >/dev/null
identity=$(psql_qa -c "$identity_sql")
[[ "$identity" == qa_test\|127.0.0.1\|5432\|*\|992ea8ce-1e2d-4ed8-b841-457fc5b6f384 ]]
psql_qa -c "$lock_sql; SELECT pg_sleep(4)" >/dev/null &
lease_pid=$!
sleep 0.5
[[ $(psql_qa -c "$lock_sql") == f ]]
wait "$lease_pid"
[[ $(psql_qa -c "$lock_sql; $held_sql") == $'t\nt' ]]
printf 'QA identity and exclusive PostgreSQL lease checks passed\n'

#!/usr/bin/env bash
# Disposable integration test; uses an existing local tsx loader and pg driver.
set -euo pipefail
: "${QA_TSX_LOADER:?set QA_TSX_LOADER to an existing tsx loader}"
: "${QA_PG_MODULE:?set QA_PG_MODULE to a local pg package}"
qa_container=qa-lease-test-$(date +%s)-$$
cleanup() { docker rm -f "$qa_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --rm -d --name "$qa_container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=disposable-test -e POSTGRES_DB=qa_test postgres:16-alpine >/dev/null
for i in $(seq 1 60); do if docker exec "$qa_container" pg_isready -h 127.0.0.1 -U postgres -d qa_test >/dev/null 2>&1; then break; fi; sleep 0.2; done
QA_LEASE_TEST_PORT=$(docker port "$qa_container" 5432/tcp | sed 's/.*://')
export QA_LEASE_TEST_PORT
node --import "$QA_TSX_LOADER" --test apps/server/src/rooms/qaDatabaseLease.integration.nodecheck.ts

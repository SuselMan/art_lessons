#!/usr/bin/env bash
# Isolated synthetic schema; never connects to the application database.
set -euo pipefail
: "${QA_TSX_LOADER:?set QA_TSX_LOADER to an existing tsx loader}"
qa_container=qa-collector-test-$(date +%s)-$$
cleanup() { docker rm -f "$qa_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
collector_sql=$(node --import "$QA_TSX_LOADER" --input-type=module -e 'import {QA_COLLECTOR_SQL} from "./apps/server/src/rooms/qaRoomCollector.ts"; process.stdout.write(QA_COLLECTOR_SQL)')
docker run --rm -d --name "$qa_container" -e POSTGRES_PASSWORD=disposable-test -e POSTGRES_DB=qa_test postgres:16-alpine >/dev/null
for i in $(seq 1 60); do if docker exec "$qa_container" pg_isready -h 127.0.0.1 -U postgres -d qa_test >/dev/null 2>&1; then break; fi; sleep 0.2; done
{
cat <<'SQL'
\set ON_ERROR_STOP on
CREATE TABLE "Room" (id text primary key, "lessonId" text REFERENCES "Room"(id) ON DELETE CASCADE, "parentRoomId" text REFERENCES "Room"(id) ON DELETE SET NULL, "assignmentId" text, "createdAt" timestamptz);
CREATE TABLE "QaRoomActivity" ("lessonId" text PRIMARY KEY, "lastActiveAt" timestamptz, "wasOpen" boolean);
CREATE TABLE "Operation" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "createdAt" timestamptz);
CREATE TABLE "RoomParticipant" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "firstJoinedAt" timestamptz, "lastActiveAt" timestamptz);
CREATE TABLE "RoomLayerSnapshot" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "createdAt" timestamptz);
CREATE TABLE "RoomLayerState" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "updatedAt" timestamptz);
CREATE TABLE "RoomPalette" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "updatedAt" timestamptz);
CREATE TABLE "RoomReviewImage" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "updatedAt" timestamptz);
CREATE TABLE "RoomThumbnail" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "updatedAt" timestamptz);
CREATE TABLE "RoomInvite" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "createdAt" timestamptz);
CREATE TABLE "RoomJoinRequest" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "requestedAt" timestamptz, "resolvedAt" timestamptz);
CREATE TABLE "RoomBlock" ("roomId" text REFERENCES "Room"(id) ON DELETE CASCADE, "createdAt" timestamptz);
CREATE TABLE "RoomOpenMeasurement" ("roomId" text, "createdAt" timestamptz, "updatedAt" timestamptz);
CREATE TABLE "Assignment" (id text, "lessonId" text REFERENCES "Room"(id) ON DELETE CASCADE, "createdAt" timestamptz, "endedAt" timestamptz);
SQL
printf 'PREPARE collect(text) AS %s;\n' "$collector_sql"
cat <<'SQL'
CREATE FUNCTION check_collect(target text, expected boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE deleted text;
BEGIN
  EXECUTE format('EXECUTE collect(%L)', target) INTO deleted;
  IF (deleted IS NOT NULL) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'collector mismatch for %', target; END IF;
END $$;
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO "Room" (id,"createdAt") SELECT x, CURRENT_TIMESTAMP - interval '31 days' FROM unnest(ARRAY['eligible','no-clock','exact','open','fork-parent','fork-child','recent-op','recent-user','recent-snapshot','recent-child','null-snapshot','pending-request','active-assignment','late-board']) x;
INSERT INTO "Room" (id,"lessonId","createdAt") VALUES ('recent-child-board','recent-child',CURRENT_TIMESTAMP), ('late-board-child','late-board',CURRENT_TIMESTAMP - interval '31 days');
UPDATE "Room" SET "parentRoomId"='fork-parent' WHERE id='fork-child';
INSERT INTO "QaRoomActivity" SELECT id, CURRENT_TIMESTAMP - interval '31 days', false FROM "Room" WHERE "lessonId" IS NULL AND id <> 'no-clock';
UPDATE "QaRoomActivity" SET "lastActiveAt"=CURRENT_TIMESTAMP - interval '30 days' WHERE "lessonId"='exact';
UPDATE "QaRoomActivity" SET "wasOpen"=true WHERE "lessonId"='open';
INSERT INTO "Operation" VALUES ('recent-op', CURRENT_TIMESTAMP);
INSERT INTO "RoomParticipant" VALUES ('recent-user',CURRENT_TIMESTAMP - interval '31 days',CURRENT_TIMESTAMP);
INSERT INTO "RoomLayerSnapshot" VALUES ('recent-snapshot',CURRENT_TIMESTAMP), ('null-snapshot',NULL);
INSERT INTO "RoomJoinRequest" VALUES ('pending-request',CURRENT_TIMESTAMP - interval '31 days',NULL);
INSERT INTO "Assignment" VALUES ('assignment-1','active-assignment',CURRENT_TIMESTAMP - interval '31 days',NULL);
INSERT INTO "Operation" VALUES ('late-board-child',CURRENT_TIMESTAMP);
SELECT check_collect('eligible',true);
SELECT check_collect(x,false) FROM unnest(ARRAY['no-clock','exact','open','fork-parent','fork-child','recent-op','recent-user','recent-snapshot','recent-child','null-snapshot','pending-request','active-assignment','late-board']) x;
ROLLBACK;
DO $$ BEGIN IF EXISTS (SELECT FROM "Room") THEN RAISE EXCEPTION 'fixture transaction failed to roll back'; END IF; END $$;
INSERT INTO "Room" VALUES ('read-committed',NULL,NULL,NULL,CURRENT_TIMESTAMP - interval '31 days');
INSERT INTO "QaRoomActivity" VALUES ('read-committed',CURRENT_TIMESTAMP - interval '31 days',false);
BEGIN;
SELECT check_collect('read-committed',false);
ROLLBACK;
INSERT INTO "Room" VALUES ('race-room',NULL,NULL,NULL,CURRENT_TIMESTAMP - interval '31 days');
INSERT INTO "QaRoomActivity" VALUES ('race-room',CURRENT_TIMESTAMP - interval '31 days',false);
SELECT 'collector boundaries, hierarchy, isolation and rollback passed';
SQL
} | docker exec -i "$qa_container" psql -U postgres -d qa_test -q -At

# A concurrent child write waits for an uncommitted deletion; rolling the
# deletion back must preserve the room and let the waiting write complete.
docker exec "$qa_container" psql -U postgres -d qa_test -q -v ON_ERROR_STOP=1 -c "PREPARE collect(text) AS $collector_sql" -c "BEGIN ISOLATION LEVEL SERIALIZABLE; EXECUTE collect('race-room'); SELECT pg_sleep(2); ROLLBACK" >/dev/null &
collector_pid=$!
sleep 0.4
docker exec "$qa_container" psql -U postgres -d qa_test -q -v ON_ERROR_STOP=1 -c "INSERT INTO \"Operation\" VALUES ('race-room', CURRENT_TIMESTAMP)" >/dev/null
wait "$collector_pid"
present=$(docker exec "$qa_container" psql -U postgres -d qa_test -q -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM \"Room\" r JOIN \"Operation\" o ON o.\"roomId\" = r.id WHERE r.id='race-room'")
test "$present" = 1
printf 'concurrent write after rollback passed\n'

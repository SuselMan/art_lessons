# Original recorded live close receiver

Close входит в тот же C3 bool receiver, что canonical frame. Wire close сначала
проходит shared strict parser и envelope sequence equality. Frame capability на
close запрещена (отсутствие/undefined эквивалентны). Scope обязан происходить от
исходного room-state owner; data-only policy не создаёт delivery. Нормализованный
close frozen; его recorded input имеет read=undefined и исходный lexical lifetime.

Held payload хранит тот же приватный proof с точными payload/owner/policy и
recorded pointer. Frame-read в этом proof теперь optional только потому, что у
close нет frame capability. Повторная доставка проверяет origin и delivery;
копии payload, подменённый owner и stale lifetime не публикуются.

Own и peer close используют один applyRemoteOp(op, undefined, recorded). До
успешного true запрещены review observation, seq cursors, sync и snapshot boundary.
Missing/pending/gap/false/throw paths не превращаются в legacy reveal или own ACK.
useRemoteOperations требует original close delivery без read, передаёт его тому
же explicit canonicalRecorded.apply sink, затем публикует applied ID/seq. Duplicate
ID остаётся idempotent после исходной lifetime validation.

confirmedStream.close.test.ts использует actual V2 room-state preparer, immutable
partial close, immediate/held own/peer delivery и negative policy/sequence/schema/
capability/pending/sink cases. Existing useRemoteOperations actual-engine test
расширен original close через appendOriginalRecorded, copied/read-mismatched
rejection, duplicate idempotence и stale rejection. Root independently owns
engine/journal seal-prefix verification and atomic publication; receiver не
подменяет их своими проверками.

Live undo/redo, Room handlers/socket activation и source grants не расширены.
Устройства, сервисы и временные сборки не создавались.

Проверка: `confirmed-close-restore-final.log` — 69 tests / 4 files PASS,
включая реальный hook→engine close после seal prerequisite. Scoped oxlint и
`git diff --check` PASS. Числовой native/GPU результат этим тестом не заявляется.

Recorded-admission recovery pairing: an optional requestCanonicalRecovery callback
uses the same current-engine/board control latch ONLY after the original recorded
sink returns false or throws. Room passes its stable callback through the existing
RoomSocketDeps spread. Missing callbacks keep the previous generic-resync behavior.
Pending previews, invalid wire metadata and sequence gaps stay on generic resync;
no new live writer or metadata authority is admitted. Tests use an actual original
read/delivery and the real control latch: source sink failure with pending Outbox
cannot join or advance cursors; final settlement after the ACK watermark drains
one join. The three generic failure categories never call that optional sink.
Tests-first failure: canonical-admission-recovery-red.log.
Validation: canonical-admission-recovery-final.log passes 93 tests / 6 files,
maxWorkers=2 and host testTimeout=30000. Scoped lint has no errors; existing Room
mount dependency warning is unchanged. Final typing is coordinated by ROOT.

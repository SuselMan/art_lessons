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

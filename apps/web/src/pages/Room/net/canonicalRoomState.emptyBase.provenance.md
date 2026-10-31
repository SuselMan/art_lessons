# Исходный empty-history baseline в том же room read

Необязательное room_state.canonicalHistoryBase — только метаданные полного
префикса от авторитетного server room-state owner. Поле не даёт права append,
author/execution, snapshot coverage или восстановления произвольного local log.
Серверная отправка, controller/engine и существующие guards здесь не включаются.

prepareCanonicalRoomState вызывает уже существующий shared
verifyCanonicalEmptyHistoryBase по SAME baseAtoms от ONE attachment до создания
и публикации read/delivery. Actual empty0 и source-bound materialV2 frame с
глобальным seq1 проходят; глобальный seq3 остаётся допустимым старым tail без
baseline, но не полным начальным префиксом. Исторический fixture не переписан.
Shared decoder/prefix validator проверяют room/epoch/cut/count/seq и после-ended
frame; собственного material parser нет. Верхний getter/inherited baseline
отвергается без вызова; getter/hidden extras внутри metadata отвергает shared
closed parser. Результат содержит захваченную immutable metadata, а не raw wire.

В SAME CanonicalRoomStateRead добавлены optional emptyHistoryBase и метод
assertEmptyHistoryBase(candidateTail). Он требует исходный read receiver,
точную ссылку на его исходный нормализованный tail и тот же current original
scope/socket lifetime через существующий Symbol validator. Spread receiver,
скопированный/чужой tail и stale generation не дают authority. Нет второго
токена, класса, карты, фабрики или очереди. Отсутствие поля/undefined сохраняет
старый read path без baseline authority; legacy room с полем отвергается.

Tests-first:14 новых FAIL /17 PASS до реализации. Проверяются empty0, actual
source-bound seq1, immutable capture после мутации raw metadata, исходный
receiver/tail/lifetime, wrong room/epoch/cut/count/global seq, truncated tail,
unsupported writer, normal-ended prefix, null/getter/hidden/inherited metadata
до dispatch. Это bounded data+original-owner proof, не доказательство полноты
DB против лживого сервера и не native/GPU/UI проверка.

B2 focused33 PASS, net/history regression25 across2files PASS; scoped lint/diff
PASS, shared optional-field build49587 PASS. Один холодный прогон дал timeout
старого dynamic-import restore test5s при transform5.96s; повтор same33 с
host-only CLI testTimeout15s PASS (весь test phase3.36s). Source timeout не менялся.
Joint app+SW61690 PASS по общей sourcefreeze B2+author refresh+SizeGUI.
Device/runtime ресурсы не созданы.


## Geometry captured by the same original room owner

The original read now retains frozen `roomGeometry` (width, height, infinite)
from the delivered room BEFORE the first caller lifetime callback. This is local
read metadata, not another wire field, source grant, token or factory. An actual
engine constructor can compare its explicit bounded page configuration with
these exact captured facts before allocating GL resources. Mutating the raw room
later cannot change the read's clipping geometry. The network preparer does not
thereby authorize an executable domain; engine admission still validates bounded
positive page dimensions and its supported complete-history source domain.

A test first failed against the previous reader: its genuine lifetime callback
mutates the raw room dimensions/infinite flag during preparation; the captured
read must retain the original64x64 bounded page. All34 existing/new room-read
tests pass. Actual engine constructor mismatch tests belong to its integration
unit. No device or temporary runtime resource was created by this change.

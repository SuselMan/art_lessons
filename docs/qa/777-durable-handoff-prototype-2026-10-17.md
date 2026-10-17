# #777: изолированный прототип durable handoff

Это reviewable прототип, не исправление выпущенного приложения и не закрытие #777.
Room/useRoom его не включает. `experimentalDurableTerminal` отсутствует по умолчанию.
Новые зависимости, shared/server/protocol и версия IndexedDB не менялись.

## Контракты

- `OutboxEntry.terminal` — локальный окончательный отказ с исходным payload,
  причина не попадает в wire Operation. Такая запись никогда не отправляется.
- `putGuarded` — read/write-транзакция, существующий terminal побеждает stale put.
- `replaceTerminal(room, originals, replacements)` — одна транзакция: все исходники
  должны оставаться terminal; все новые IDs свободны; затем replacements и компактные
  retired fences записываются атомарно. Abort оставляет все исходники и ноль замен.
  Повторный конкурентный handoff проигрывает без публикации второго плана.
- Retired fence не является Operation и фильтруется из getAll. Он не позволяет
  позднему обычному put второго нового writer воскресить уже перенесённый оригинал.
- Opt-in Outbox освобождает network slot до ожидания terminal storage/handoff.
  Отдельный settling-ID guard запрещает повторный send. `whenTerminalIdle()`
  означает завершение хранения, не server ACK; ошибки диска не проглатываются.
- `createDurableRecoveryPrototype` захватывает roomId, planner metadata, старый
  engine через callback и проверку его актуальности. Никаких engineRef/current
  board refs внутри. Enqueue/flush не используют ACK/whenIdle. После смены доски
  replacements остаются в старом room и не рисуются в новом engine.
- Debounce scheduling оставлен владельцу planner. Reset UI не должен вызывать
  уничтожение intent: intent уже записан terminal; после restart Outbox снова
  передаёт terminal planner. Пустой scoped Dry не превращается в пустой слой:
  ошибка flush сохраняет terminal для последующего планирования с content.
- Для non-target_gone нет автоматического восстановления: отказ остаётся terminal.
  Права/freeze не обходятся. Нужен отдельно согласованный UI для такого intent.

## Проверка

Итог targeted CPU run: 6 files, 53 PASS + 3 expected legacy failures. Полный
web TypeScript check и scoped oxlint PASS.

Memory-storage tests используют structuredClone, новые Outbox instances и рестарт.
Проверены оба известных контрпримера #777: reset до 800ms и поздний permanent
verdict после retirement/unfreeze. Реальный engine/mock GL восстанавливает точные
байты потерянного pencil stroke на старой доске; новая доска остаётся пустой.
Проверены освобождение двух сетевых слотов, stale второй writer, observable disk
failure и handoff abort с сохранением payload. Существующие default-OFF tests
остаются прежними; три `it.fails` продолжают документировать дефект legacy path.

`runs/777-idb-atomic-proof-20261017.json` — реальный Chromium 151 IndexedDB,
8 проверок, включая настоящий DataCloneError в середине транзакции и page restart.
Хеш исходного storage-модуля сохранён в proof. Запуск только IDB с --disable-gpu,
ноль WebGL-контекстов: это не доказательство рендеринга на Surface/Samsung/AMD.
Собственный browser/profile закрыт и удалён штатной уборкой; компактный proof
перенесён в репозиторий, собственный cache JSON удалён. Новых сервисов нет.

## Обязательные OPEN перед promotion

1. **Старый reader несовместим.** Существующий DBv2 reader не знает terminal и
   снова отправит original; compact fence тоже не является допустимой старой
   Operation. Нельзя публиковать без migration/writer-fence решения. Нет обещания
   backward compatibility даже с соседней старой вкладкой.
2. **Нет GC tombstones:** без writer fencing нельзя доказать, что stale writer
   больше не существует. Это сознательная оценочная граница прототипа, не
   утверждение bounded production storage.
3. Уже in-flight packet другого таба до известия о terminal нельзя отозвать.
   Сервер не хранит rejection ledger. Нет глобального exactly-once обещания.
4. Между получением ответа сети и записью terminal остаётся crash window. При
   storage failure completion отвергается, original durable payload остаётся,
   но после crash старый sendable row может повториться. Без server ledger или
   заранее durable in-flight/decision protocol это не устранено.
5. #778 cross-batch recovery target mapping остаётся OPEN: разные batch могут
   создать разные recovery layers и разорвать материал. Внутри batch используется
   текущий recoveryOperations с сохранением M70 времени и scoped Dry.
6. Нет UI wiring/promotion: owner должен передавать immutable captured metadata,
   сохранять scheduler intent при reset и иметь понятное отображение terminal.
   Publish после storage commit может быть пропущен при смене доски — durable
   replacements восстановятся при возврате; нельзя направлять их в новые refs.
7. Допущение all-new readers относится к opt-in writers. Существующий default-OFF
   runtime не становится решением multi-tab terminal isolation автоматически.

## Дополнительное review: три воспроизведённых corner

На исходном 8dda044d отдельный `outbox.prototypeCorners.test.ts` дал 3 FAIL:

- другой writer retired исходник при 12-й неудачной отправке: pending=0,
  stalled=1, onStalled вызван по уже удалённому ID;
- enqueue/единственный scheduled flush второго пакета во время gated transaction
  возвращал promise первого пакета; второй intent оставался terminal навсегда;
- same ID/new room получал terminal entry чужой комнаты вместо отказа collision.

Узкие правки только прототипа: после guarded retry-persist повторно проверяется
held entry; повторный flush цепляет новый drain после текущей транзакции;
guarded storage отвергает cross-board collision до чтения terminal/retired.
Targeted run 5 files / 56 tests PASS; полный web TypeScript check и scoped lint PASS. Реальная IndexedDB повторена,
теперь 8 проверок, включая cross-board collision, proof содержит новый source SHA.
Профиль review также закрыт и удалён штатным guarded cleanup; новых сервисов нет.

# GL400: после быстрого DOWN остаётся дорогой UP

ONE Surface, source32a786c0, actual joinedTouch+mixedLease+timing ON.
Source/constructor/owner gate PASS; ring23/1024, dropped0/errors0, GL0.
Первый DOWN27.1ms, следующий DOWN6.2ms, positive nib submission3.7ms,
display submission5.5ms. Следующий UP110.7ms включает completeSettle43.0ms.
Остаток67.7ms — неатрибутированное elapsed; нельзя назвать его GPU/source cost.
Max RAFgap73.2ms, после UP возврата первый RAF27.2ms. Это один наблюдаемый
сценарий, без baseline arm, physical stylus/visibility и quality parity claim.
Actual firstUP→secondDOWN gap и beforeSecond wet value не были сохранены в
compact controller; actual pending=true и wet/packed hashes сохранены.
Никакой подстановки100ms или wet=1 нет. Повтор автоматически не запускался.

## Что действительно исполняется на UP

Engine._onEnd:6626: endStroke→taper/pooling/lift→tail paint→finishRibbonStroke
→display→pack/log/local callback/socket→PaperWet.commitPending→settleLayers.
_finishRibbonStroke:8728: owned finish capture, liveComposite flush, reveal
before/wet-mask copies; при diffusePending принудительно completes предыдущий
solver, потом prepares новый _diffuseWashOps и начинает его.
WatercolorSettleQueue.start:163 исполняет первый stitch/copy op синхронно NOW,
остальные ops планирует по RAF. Поэтому finish не равен одному complete43ms:
в нём есть source/copies/preparation и первый command нового solver.
complete:285 исчерпывает remaining ops + completion/copyback/reveal/display;
CPU scope может включать driver wait, но это ещё не доказанный GPU cost.

Быстрый secondDOWN не гарантирует немедленную физическую картинку: GPU может
исполнять команды прошлого UP, а UI input callback ещё не исполниться во время
самого UP. В этом run GPU queue wait отдельно не измерен; 6.2ms — только CPU
обработка уже доставленного callback. Нельзя объяснять latency одним GPU по
этому числу.

## Минимальная следующая CPU инструментализация

Captured actual local user/layer/stroke ownership + отдельный UP scope. Spans:
geometry/tail paint; full finish с nested capture/flush/reveal copy/preparation/
first stitch; display; pack/log/local callback; pending commit/settleLayers.
Сохранять исходные исключения, полную timeline и вложенность. Не складывать
nested durations повторно; exclusive остаток вычислять по union intervals.
Все OFF ветки сохраняют исходные вызовы без новых clocks/diagnostic closures.
Next controller сохраняет actual firstUP-return и secondDOWN-begin endpoints,
read-only beforeSecond center/eligibility wet sample с реальными часами.

## GPU измерения и ограничение команд — пока предложение

В GL source не найден существующий EXT_disjoint_timer_query recorder.
Поддержка extension на Surface здесь не проверена. Возможный DEV-only следующий
шаг: bounded pool<=4 ненестящихся TIME_ELAPSED_EXT queries вокруг UP или DOWN
submission, availability poll после input, result только после available,
GPU_DISJOINT_EXT инвалидирует interval, loss/destroy освобождает own queries.
Не readPixels/finish/fence. Query duration — исполнение commands внутри scope,
не ожидание ранее накопленной очереди и не время physical visibility.

Просто заменить complete() на N ops/RAF небезопасно: предыдущий и новый solver
делят поле, а start stitch захватывает material boundary. Existing advance()
уже даёт bounded existing-op boundary, но будущий bounded UP требует отдельного
owned capture/publication gate и доказанной FIFO/history/export эквивалентности.
Не откладывать stitch или копирования без такого владения и pixel proof.

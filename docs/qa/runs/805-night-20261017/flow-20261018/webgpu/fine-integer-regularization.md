# Полный fine integer paper operator

`macro11-fine-paper.ts` экспортирует `fineIntegerDefinitions`, id `wgsl-macro-integer-fine-paper`. Это **новый regularization/transport operator**, не PACK-only и не замена модельного сравнения dither. Root подключает registry, аппаратные проверки выполняет единственный оператор.

## Что переносится

Основной macro9 выполняет свою динамическую воду/смешение/адсорбцию без изменений. GPU read-only borrowed view конечного coarse state получается через optional `observePacking`; default factory этот callback не вызывает и ничем не меняет команды.

Init разворачивает coarse mobile M на fine1024, D остаётся неподвижным nearest coarse deposit. Literal stationary пигмент также остаётся неподвижен. Для fine ячейки freeAlpha=65535−257*literalAlpha−Dalpha. Нарушение начальной capacity записывается в явный guard, не прячется clipping. Fine-wet gate — фактические конечные W+S>0, а не initial water: dynamic frontier не обрезается обратно.

Affinity `1+(255-paper)*gain/4` — явно феноменологическая предпочтительность впадин настоящей fine бумаги, не калиброванное давление. 0gain даёт обычное выравнивание концентрации; 0fineSteps отдельный контроль без fine переноса. Попарный градиент alpha/affinity определяет направление и количество carrier. Переносимый packet RGB пропорционален alpha donor, единый packet добавляется/вычитается без потери целых кодов. Capacity receiver ограничивает packet. Каждая фаза содержит непересекающиеся пары, четыре parity/axis фазы покрывают обе оси; все destinations записаны ровно один раз, включая непарные края.

Сохраняются все4 суммы mobile кодов точно до finalRGBA8. Premultiplied cone и capacity доказаны100k ограниченных случайных пар; numerator≤65535²+32767<2^32, unsigned overflow не используется в физике. Hash overflow применяется только в прежнем display dither.

## Ограничения и измерения

12локальных фаз могут переносить массу максимум на12fineпикселей; это регуляризация coarse блоков и бумажных локальных потоков, не источник200px макротранспорта. Deposited coarse блоки остаются неподвижны: при сильной адсорбции сетка может сохраниться. Поддержка actual final wet остаётся дискретной coarse, хоть и не initial contour. Бумажная affinity может выглядеть зернистой: художественное качество ещё не проверено.

Заимствованные buffers принадлежат base и освобождаются только base.destroy. Fine owns два16MiBmobile,16MiBaux,4MiBpaper,16MiBledger staging и малые uniforms/guard: около68MiB дополнительно; staging не часть persistent source cache. Init+12pairs+PACK —14добавленных dispatch. Старый coarse PACK из base.run также исполняется один лишний раз до перезаписи: это явно учитывается в metadata/timing, оптимизировать после численного gate.

Полная fine copy/map16MiB выполняется только в readback после timed compute. Metadata fineLedger содержит все4суммы, ожидаемую fine mobile alpha (64*coarse mobile alpha), guard init/pack и qualification. Для сравнения массы PNG остаётся отдельная8bitошибка; dither не обеспечивает точную сумму конкретного изображения.

6CPU PASS:100k pair conservation/premul/capacity/dry, paper flow vsflat/null, shader parity writers,12phase spread/bound, actual adapter dispatch/readback/lifecycle/defaultborrowed ownership, reserved WGSL/no-float. Strict TypeScript и lint PASS. Никаких GPU действий автором.

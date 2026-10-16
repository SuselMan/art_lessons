# #753: prospective material-clock audit

READONLY: новый формат не реализован, recording defaultOFF, старые операции
не мигрируют и не переписываются. Operation timestamp остаётся временем
commit/UP для прежних общих потребителей. Порядок операций задаёт seq, часы
только определяют границу мокрого периода; они не переупорядочивают рисунок.

Сейчас controller.source присваивает layer.timestamp перед paint; accept/finish
не фиксируют последний фактический dab. Живой источник при DOWN использует
Date.now, а зафиксированные chunks/UP тоже записывают Date.now. Replay берёт
op.timestamp. Поэтому долгое удержание и долгое непрерывное рисование могут
дать разные wet periods live/replay. watercolorUndo.ts имеет собственный
layerLastAt.set(op.timestamp); hasActiveWater тоже читает timestamp. Исправить
один controller недостаточно.

Два optional endpoint-поля `{v:1,startedAt,lastMaterialAt}` могут решить
межоперационные сравнения, но **не кодируют внутренний gap>=120s**. Одна
операция с dab0 и dab131s внешне имеет теже endpoints, что непрерывное
рисование0..131s. Текущий sliced replay делает source один раз на op, не
воспроизводит временные material breaks внутри массива dabs.

Минимальный вариант без нового списка segments:

- Recorder держит wall anchor на DOWN и monotonic performance anchor; часы
  actual paint batch = wallDOWN + (performance.now - perfDOWN), не время UP
  и не wallclock после изменения системных часов. Preview/predicted dabs
  не обновляют lastMaterialAt.
- startedAt означает первый **фактически нарисованный dab текущего chunk**,
  а не общий DOWN всего gesture. lastMaterialAt — последний actual paint
  этого chunk. FixedDOWN на каждом chunk скрывал бы поздний samegesture gap.
- До нового actual batch с gap>=120s recorder flush предыдущего chunk,
  затем начинает новый clock range; source закрывает прошлый wet period
  обычным сравнением, без исключения samegesture. StrokeId можно сохранить
  для жеста undo, но это уже две material эпохи. Пустой chunk не записывается.
- Сушка/hide/структурный material boundary по seq остаются приоритетнее часов.
  Операции после Dry не могут присоединиться к прежнему wet period только
  из-за старого startedAt. Таймеры анимации не являются material clock.
- Continuous180s: lastMaterialAt180s, следующий DOWN181s остаётся мокрым.
  Material0s→hold180s→UP: lastMaterialAt0s, следующий181s сухой.
  Material0s→gap130s→material131s: chunk split, старый материал закреплён
  перед новым dab одинаково live/replay. Ровно120s тоже boundary.

Альтернатива — versioned recorded breaks/per-dab logical times и replay
source segments. Dabs.t уже содержит elapsed, но его текущий float32 codec,
различия input-event/performance clocks и per-op slicing нельзя молча считать
каноническим v1 contract. Если chunk split нежелателен, надо явно выбрать
и записать этот более богатый формат вместо двух endpoint-полей.

Совместимость:

- Один shared reader валидирует exact v1, finite safe bounds и
  startedAt<=lastMaterialAt; malformed/unknown не должен частично менять
  semantics. Server validation принимает optional поле, snapshots/history
  сохраняют его; raw shallow cloning не должен потерять поле.
- Legacy op без поля использует прежний timestamp, all-legacy canvas
  воспроизводится прежним путём. QA recorder flagOFF, reader понимает v1
  независимо от локального флага, иначе peers расходятся.
- source сравнивает new.startedAt с prior lastTouch+120s и лишь после paint
  увеличивает lastTouch до lastMaterialAt. Accept/finish не трогает clock,
  если новых actual dabs не было. Eraser logical expiry/parked clocks/
  hasActiveWater/resolver читают тотже helper, а не Date.now при replay.
- Для out-of-order offline old op max(lastTouch,new.lastMaterialAt)
  предотвращает обратный ход **v1** слоя. Но нужен явный mixed-domain contract:
  если последующий legacy op снова присваивает timestamp напрямую, clock
  всёравно отматывается. Вариант: после первого v1 в текущем wet period
  clamp max для всех incoming touches; all-legacy period остаётся legacy.
  Это решение ещё не принято; само поле max не устраняет проблему.
- Long stroke может быть interleaved с чужими committed ops. Seq сохраняет
  порядок, historical prefix обязан переносить clock fields в resolver;
  нельзя пересортировать историю по startedAt. Existing unsettled replay
  repair всёравно нужен, live decoration не является canonical oracle.

Нужны unit: обе120sграницы, holdбезpaint,continuous180, gapвнутриgesture,
chunkflush, systemclockjump, mixedlegacy, offlineoldop, Dryмеждучанками,
park/rehydrate и snapshot/history roundtrip поля. Затем sameGPU live/replay
длинныхжестов наhardware. Это пока план, ни новыйcontract ни flag не включены.

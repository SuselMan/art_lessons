# Покрытие GPU затрат actual GL

Offline диагностический модуль `runGpuCoverage(engine,{cohort})`, где engine —
исходный bundle 728-engine-webgl2. Без изменения движка, модели или defaults.
Не запускать параллельно аппаратным задачам других агентов.

Три последовательных независимых серии одной packed mixed400/Fine ленты:

- passes: front/diffuse/brush/fieldOp/resample/cost/colour/paired seams;
- transfers: buffer clear/copy/write и GL texture uploads/mipmap;
- raster: StampPainter.paint, compose/display и оставшиеся raw draw calls,
  включая ribbon/source, с caller stack.

В каждой серии один GpuMethodTimer; nested query запрещена и пропуск явно
посчитан. Missing methods тоже явно записаны. Отдельно CPU/API числа finish,
flush и readPixels только внутри timed paint (последующие field readback и
export не включаются). CPU finish не равен стоимости метода shader: он может
ждать предыдущую очередь. Paper fetch/compile/init вне paint; понадобятся
отдельные init-замеры, если это предмет исследования.

Каждой серии нужен отдельный uninstrumented wall контроль того же frozen
bundle, и сравнение всех 26 полей/material/RGBA. Для GPU sums сначала проверить
unavailable, nested, capacity, invalid и pending; sampled coverage неполна при
пропусках. Складывать интервалы разных серий и вычитать из wall нельзя.
Даже полное покрытие GL command execution не покрывает browser composition,
rAF ожидания, все CPU подготовительные участки или зависимость критического
пути. Следующий actionable результат — ранжирование действующих GPU операторов
и CPU fence-call intervals, затем локальный candidate по ведущей категории.

Модуль проверен `node --check`; ещё НЕ выполнялся на аппаратном устройстве.

## Измерено на Surface

Frozen engine 21ec7a6d, тот же Fine/mixed400/page2048×1024. Все три серии
совпали с uninstrumented baseline по 26 полям/material/RGBA/tape.
GPU query supported, invalid/disjoint/pending/capacity=0; compose вложен в
_display и отдельно не суммируется. Wall baseline 5869.8 мс; passes5881.8,
transfers5893.9, raster6184.5. Это по одной серии, не статистическая оценка.

| Оператор | Calls | GPU ms | CPU submission ms |
|---|---:|---:|---:|
| waterFrontStep |252|687.57|33.30|
| fieldOp |215|372.83|40.60|
| diffuseStep |39|83.93|7.50|
| brushPass |408|81.30|58.00|
| wcResample |40|9.63|6.30|
| pigmentColor |1|1.42|0.50|
| clear |44|11.14|20.20|
| copyTo |22|7.04|4.00|
| copyRegionInto |444|11.53|37.20|
| _display (включает compose) |5|6.46|6.00|

Самый тяжёлый **из измеренных** оператор — front, затем fieldOp. В passes
front занимает около 56% суммы GPU-интервалов, не 56% задержки пользователя.
Carry MRT ранее снимал примерно30GPUмс, но whole gain не проявился.
Отсюда priority: сначала lifetime/schedule/fence критического пути и оставшееся
покрытие, параллельно proof-safe сокращение поддержки/front invocations;
повторная произвольная оптимизация копий в этом сценарии имеет малый масштаб.
Static GL cache на1536 уже не прошёл exact gate — его нельзя включить ради
687мс. Сокращение front требует сохранить донорные границы, paper coordinates,
Q8 порядок и halo, а не заменить модель более быстрым приближением.

Важное ограничение инструмента: прямой wrapper adaptedGL.texImage2D рекурсирует
из-за override→raw обращения; другие методы уже cached/bound и обходят подмену.
Первый transfers arm был безопасно прекращён и собственный target закрыт;
failed raw сохранён отдельно. Успешный harness больше НЕ подменяет эти методы.
Upload/raw draw/CPU finish явно отсутствуют в targets; cpuApi={} — **нет
замера**, а не нулевые затраты. Для них нужен hook до cache-bind на уровне
адаптера/создания контекста, отдельный frozen вариант и повторный exact gate.
Этот gap запрещает называть wall−GPU «CPU тормозом» или выдавать строгую
границу Амдала. CPU submission в таблице — только тело соответствующего
обёрнутого метода, включая инструментальный overhead.

Собственные вкладки закрыты, post-run free2041MiB. Для повторения:
`node build.mjs frozenBundle out`, затем существующий private preview,
`GATE_URL=... GATE_OUT=... node controller.mjs`. Требуется эксклюзивное
согласование Surface, preflight1700/abort500; URL не хранится в Git.

Baseline queueCapture: 334 ticks, continuation0, contact204/front70/barrier60,
presentation0; flags front/presentation/contact/continuation OFF. Tick bodies
суммарно140.6мс, максимум46.3мс. Queue sync callback0: это не доказательство
отсутствия других gl.finish/fences. Per-operation phase wall:
layer_add19.6 / stroke2850 / stroke2900 / paper_dry50.4мс. После каждой
операции idle ждёт3стабильныхrAF; в конце есть ещё один idle. Snapshot не
содержит timestamp начала tick и не измеряет межкадровые интервалы, поэтому
нельзя объявить оставшиеся wall milliseconds «CPU» или чистым ожиданиемrAF.

Но 334 раздельных ticks при двух strokes по≈2.9с показывают конкретное
направление следующего замера: timestamps начала/end ticks, frame cadence,
readyQueue/deadline/GPUcompletion overlap. Прежний baseline делает по одной
канонической единице в tick; уменьшение GPU времени единицы может сохранять
то же количество кадров. Proof-safe группировка должна сохранить каждый
Q8 pass/оператор и достаточную отзывчивость, сравнить output вместе с live
animation/input latency. TickElapsed140.6мс — наблюдаемое CPU+sync тело,
не вся CPU подготовка и не GPU time; суммы из разных часов не вычитаются.

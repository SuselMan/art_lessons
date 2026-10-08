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

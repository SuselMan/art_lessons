# Runnable CPU visual candidate (OFF)

Запуск без сервиса/браузера/GPU:

```sh
node docs/qa/harness/728-gl-queue-batch/runSmallPairedPreviewDemo.mjs /path/to/registered-disposable/demo.svg
node --test docs/qa/harness/728-gl-queue-batch/smallPairedPreviewPrototype.test.mjs
```

Сохранённый минимальный synthetic результат — `small-paired-demo.svg` (step0/6/12/24), `small-paired-demo.json`. Цветной рисунок — условный Beer-Lambert amount display, НЕ Grafetto material render. Движется поле moments с сохранённой массой, не наложенная alpha animation. Runtime не импортирует этот prototype. Factory default OFF возвращаетnull без allocation. Side только128/256;512/large400 не принимается. Канонический рисунок/операции не используются и не меняются.

## Что соответствует actual128 solver

Driver повторяет donor форму текущих modes15/16: traveling concentration Ti=travel*P.a/capacity_i, harmonic capIJ=2capIcapJ/(capI+capJ), outgoing give=rate*w/sumWeights*min(max(Ti−Tj,0)*capIJ,travel*P.a)/max(P.a,5e−5). При costs_i/costs_j≤1e−5 capIJ*=w/4^pow. Этот же fraction применяется к каждому из8 старых P/C moments. Поскольку sum normalized weights=1 и give≤rate*travel, total outgoing≤1. Учитывается только old input; оба результата записываются в общий nextfield, без component clamp.

Cost, capacity, four faceWeight и binary wet connectivity — явные входы. Prototype не вычисляет новую paper/front модель и не притворяется actual readback: demo использует cost0/capacity1/weight64, соответствует условному нулевому плато actual donor формулы. Для реального источника нужно подать readonly current128 pressure/path/capillary, отображённые в high ROI с правильнымworldorigin. Lift source filtering и wet connectivity должны быть проверены отдельно. Current dyadic stride8/16 здесь не используется: шаг только один соседний worldtexel, чтобы не перескакивать сухие разрывы. Значит, одинаковая donor algebra НЕ означает одинаковый spatial/time evolution или canonical endpoint. Speed/profiling пока отсутствуют.

## Условия безопасности/качества

- Общие fractions для всех8moments сохраняют их массы и не создают hue вне convex mixture donor ratios. Tests проверяют две смеси.
- Dry edge запрещает flux; отдельная соседняя мокрая лужа без пигмента остаётся без пигмента. Никаких jump-strides.
- До каждого шага worst-case mass through outer ROI считается. Если >1e−8, step НЕ исполняется, status=fallback-boundary, previous field остаётся exact; нельзя выдавать этот остановленный кадр за принятую анимацию. Настоящее admission должно выбрать fallback current renderer.
- t0 source-copy exact. Положительность без поканального clamp; source не изменяется. После dispose buffers освобождаются для GC.
- CPU Float64 выбран для проверяемого oracle:128 owned initial+current2MiB,2568MiB; step требует временный nextfield+fractions, поэтому peak выше. Это НЕ GPU budget promise. Float32 GPU план отдельно1/4MiB ping-pong.
- Wholeviewport material t0, actual interpolation, visual quality, endpoint canonical и final handoff не проверены этим CPU helper. Новая модель явно experimental.

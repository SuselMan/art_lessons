# Exact CPU initializer optimization

Новый `macro20-fast-initial.ts` экспортирует `initialIntegerDynamicFast`, тот же результат state/aux/stationary/summary как прежний `initialIntegerDynamic`. Старый source/function не меняется. Root/material агент подключает отдельный opt-in coherent initializer hook.

## Что сокращено

Старый путь сначала выделял4MiB `packedRGBA` и проходил весь input, затем для каждой8×8ячейки reduce, выделял sum/codes.map массивы и повторно сканировал64пикселя ради stationary. Новый путь одним per-cell scan собирает wetRGBA, water, paper, maxDryA/maxWetA, сразу записывает literal dry carrier. В обычной no-freeze ячейке второго scan нет. Только capacity-frozen ячейки повторно обходят wet pixels и добавляют их к stationary.

Rounding буквально прежнее: floor((sum*257+32)/64), W=floor((water*257+128)/256), P=floor((paper+32)/64); capacity и frozen threshold прежние. Summary суммируется из целых локальных totals, поэтому перестановка сумм не меняет число (далеко до2^53). Aux unused words/state deposits остаются typedarrayzero. Ненулевые RGB приalpha0 тоже сохраняются побитово в literal fallback, хотя factory обычно запрещает такую premul ошибку. Внутренняя validation не добавлена: старый initializer её не имел; factory.validateInput перед upload остаётся прежним. Контракт — тот же validated1024 input, не новая поддержка иных размеров.

3CPU PASS (18.8s): zero/densewet/alldry/saturatedcap/mixedopaque frozen/alpha0RGB compatibility;16независимо seeded sparse/dense random inputs;все13сохранённых actual common inputs. Во всех случаях сравниваются все bytes state,aux,stationary и deep summary, а не только PNG/хэш. Actual test включается `QA_NATIVE_INPUTS=<saved extra-inputs>`; безреальныхфайлов этот case явноskip. TypeScript/lint PASS.

## Измерение, не GPU обещание

`macro20-fast-initial-bench.cjs` компилирует один bundle заранее, запускает2warmup, затем3ABBA (6samples/arm). InputIO/compile исключены, allocations included, noforcedGC. Node sharedVPS:

| Сцена | Old median ms | Fast median ms | Отношение |
|---|---:|---:|---:|
| mini-wave |47.52|15.62|3.04×|
| sheet7 |44.87|15.12|2.97×|
| sheet12 |37.98|14.05|2.70×|
| dense |50.18|16.72|3.00×|

Полные paired samples/inputSHA/sourceSHA в `fast-initial-cpu-bench.json`. Это не browser/GPU/totalReady speedup: реальный engine upload дополнительно строит stream/копируетGPU, а общий расчёт может быть ограничен kernels. Требуется аппаратный A/B до заключения о выигрыше пользователя. Нет новых GPU действий, сборок, сервисов, зависимостей или raw input копий. На disk7.5GiBfree новых расходных больших файлов не создавалось.

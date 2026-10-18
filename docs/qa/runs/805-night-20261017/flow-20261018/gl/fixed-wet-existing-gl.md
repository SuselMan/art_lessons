# Явные GL-фабрики неподвижной исходной воды: покрытие

В обязательных36 GL-выборах:24DSL,2Stable,1artistic,2finite-volume,2correlated-paper,2macro2-dense,1macro3-hydraulic,1macro-multiscale,1macro-geodesic. Новых конфигураций и вымышленных картинок этот этап не добавляет. Обычные `create` остаются историческими; worker использует только явную `createFixedInitialWet`, без fallback.

## Шесть проверенных aliases: shader/draw path буквально тот же

`reviewedFixedWet` меняет только read-only provenance metadata и делегирует upload/run/destroy исходному владельцу. Actual factory tests сравнивают **все** скомпилированные строки, загруженные байты и draw/uniform order обычной фабрики и alias; исходные paper/water/pigment не модифицируются. Metadata содержит actual compiled source texts для SHA вне таймера.

| Модель | Геометрическое основание | Ограничение качества |
|---|---|---|
| finite-volume | `receiverWeights`: все16 rawwater>0; cardinal face проверяет j0..4; alias допускает только stride≤4 | Partial coarse не переносится без optional fineSmooth. Вне текущих конфигураций coarse>4 явно отвергается до allocation |
| porous-water | full1024 raw aux неизменен; water/pigment cardinal gate проверяет все j0..stride≤8 | Очень слабая вода блокируется smoothstep; это static-domain water, не продвижение смачивания |
| macro-multiscale | raw4×4 minimum; каждый cardinal coarse путь j0..stride≤32; raw fineSmooth | Частичные клетки закрыты coarse; fineSmooth≤2 даёт только локальное движение |
| macro2-dense | raw4×4 minimum; `pathDistances` включает оба боковых диагональных пикселя и каждый шаг; raw cardinal fineSmooth | Локальное движение partial при fineSmooth; low-water smoothstep может заморозить слабый след |
| macro3-hydraulic | raw8×8 minWater; aux блокирует cardinal пары, margin возвращает raw на partial | **Все partial wet остаются неподвижными.** Тонкая1px линия не течёт. Это ограничение художественного поведения, не успешная тонкая кромка |
| macro-geodesic | rawwater>0,4-neighbor DFS; involution endpoints внутри одного реального мокрого пути | Нелокальное смешивание, не скорость жидкости; RGBA8 premul и повторяемость всё ещё требуют GPU-проверки |

Default source/draw сравнение нового GL4 fixed-mode отдельно сохранено тестом на pinned440cf78b. Для этих aliases новые GPU-суммы не выдумываются: старые UNORM/осаждение/сатурация имеют прежние ограничения.

## Почему dry0 недостаточно

У paper/correlated/hybrid найден8-neighbor диагональный поток с проверкой только осевой линии диагонали. Он мог переносить цвет между двумя мокрыми диагональными пикселями, даже когда оба ортогональных угла сухие. Последний rawdry restore давал dry0, но не доказывал мокрый путь.

Opt-in `guardRawWetCorners` вставляет **только** min-gate двух ортогональных raw-water клеток каждого unit step диагонального stride≤8. Старые коэффициенты, centerline gate, бумага, blur taps, split/deposit, pass order и все конфигурации сохраняются. Default shader bytes неизменны. На трёх actual factories CPU проверяет, что fixed отличается ровно одним flow shader, а draw/bind/uniform order полностью совпадает. Проверки повторной/несовместимой трансформации fail-closed. Correlated входит в обязательные36; paper и hybrid — дополнительные фабрики, без расширения135-choice каталога.

Wet-boundary/detail ещё не получает alias: lowreduce усредняет частично сухие клетки, реконструкция восстанавливает сухие pixels только в конце. Для будущего fix согласован full-wet partition, mask-aware4donor reconstruction, mobile existing fullFlux2/3 passes и сохранение detail/paper operators. Это дополнительная семья вне обязательной матрицы, она не блокирует проверку36.

## Проверки и устройство

7CPU alias tests (включая preallocation отказ finite-volume stride8),4corner factory/source tests; strict/noUnused TypeScript иoxlint0. Device plan разбит на первые12, затем дополнительные14 и4 проверки ранее сухих семейств; включая diagonal/one-pixel стены и настоящий sheet12. Это диагностические запросы, **не GPU PASS** и не готовая полная матрица. Faint/partial stationary явно записываются как limitation, а не скрываются за статусом fixed-domain.

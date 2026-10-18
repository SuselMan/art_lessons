# Строгая финальная сборка 135×30

`review_fixed_matrix.py` не выполняет расчёты, не обновляет HTML и не использует660 архивных картинок как запасной результат. Нужны нормализованные клетки от новых отчётов и независимых raw-аудитов. Схема описана в модуле; worker-адаптер `worker_cell_from_batch` проверяет весь batch, а не только отдельную строку.

```sh
python3 docs/qa/prototypes/805-algorithm-search/review_fixed_matrix.py \
  --shell "$QA_STATIC/flow/comparison.json" \
  --plan docs/qa/runs/805-night-20261017/flow-20261018/webgpu/comparison-coverage-plan.json \
  --manifest "$QA_FLOW_CACHE/review-135x30-job-manifest.json" \
  --allowed-builds "$QA_FLOW_CACHE/allowed-fixed-builds.json" \
  --input-catalog "$QA_FROZEN_INPUT30/catalog.json" \
  --native-source-proofs "$QA_FLOW_CACHE/certified-authored-source-proofs.json" \
  --component-counts "$QA_FROZEN_INPUT30/component-counts.json" \
  --cells "$QA_FLOW_CACHE/normalized-worker-cells.json" "$QA_FLOW_CACHE/normalized-native-cells.json" \
  --references "$QA_FLOW_CACHE/normalized-reference30-cells.json" \
  --coverage-report "$QA_FLOW_CACHE/final-coverage.json" \
  --coverage-text "$QA_FLOW_CACHE/final-coverage.md" \
  --output "$QA_FLOW_CACHE/final-fixed-comparison.json"
```

Shell служит только источником заголовков/порядка30 сцен. Все variants заменяются только после полного PASS. Код возврата2 означает неполное/невалидное покрытие; прежний output остаётся нетронутым. JSON и Markdown показывают valid/required для каждого мазка, пропуски, дубликаты и ошибки. Изображения проверяются по SHA существующего файла; никакого повторного рендера нет. Для reference нужен exact carrier SHA исходного RGBA, не только декларация «это вход».

135 стабильных comparisonKey сохраняются без пересчёта по изображению. `original` сохраняет DOM-id для hold-baseline, input получает `input`; остальные id обязаны быть уникальны внутри карточки. Исторические displayDiagnostics не импортируются. Source-backed gridResolution проходит через существующий annotate_resolution. Hide/hold/zoom остаются функцией неизменённого compare.html.

## Native component-isolated policy

Authored13 не переводятся принудительно в forward seed. Два отдельных договора: `authored-native-replay-v1` и `common-optical-seed-v1`. Первый требует точного authored replay/captured raw/common/paper, исходного native composite и сохранения baseline; второй честно обозначает synthetic material. Оба требуют одинаковой фактической component isolation.

`nativeProof.componentIsolation` связывается с immutable inputSHA и sourceHashes; policy `native-component-isolated-v1`, connectivity4, threshold0. Независимые frozen counts задают ожидаемое число компонент и pigmented goals. Для30 сцен это39 pigmented component goals на одну native-руку,156 — минимум pigmented goals на4 руки/120 клеток, НЕ total. Текущий actual contract исполняет также water-only компоненты и проверяет zero-C output;49 исходных wet-компонент дали бы196 вызовов на4 руки при совпавшем actual-native component contract. Dry-only имеет0. Все количества должны быть подтверждены source-bound actual dispatch.

Проверяется массив actual dispatch, а не declared pass: семь исходных planeSHA и paperSHA; для каждой компоненты уникальный id/inputMaskSHA, ожидаемые CPU masked-plane SHA и реальные GPU readback SHA, нулевые inside-original diffs; только пять material planes p/c/coverage/solvent/foreign обязаны быть нулевыми вне компоненты; original и paper сохраняются глобально с exact original SHA. Exact sampled paper, endpointSHA, нулевые outside-endpoint/raw-dry diffs, ровно один goal. Counts, маски и аудиты должен подготовить независимый нормализатор из фактического отчёта. Сам сборщик не превращает dryIdentity в доказательство внутренних путей и не сертифицирует неизвестные поля.

Никакого output-dependent dose scaling, старых нефикисированных вариантов или автоматического authored fallback. Common renderer требует входозависимый scale и явное отсутствие нормализации по результату. Native authored composite сохраняется отдельно оговорённым actual доказательством, а не подменяется PNG нового seed.

Независимые counts воспроизводятся `node docs/qa/prototypes/805-algorithm-search/review-component-counts.cjs "$QA_FROZEN_INPUT30/catalog.json" "$QA_FROZEN_INPUT30/component-counts.json"`. Сканируются original water>0/alpha>0, только четыре соседа. Все30 счётчиков совпали с отдельным root-аудитом:39 pigmented,156 goals. Каждая строка counts привязана к трём SHA исходного входа; неподписанный старый count-only файл CLI не принимает.

## Жёсткая привязка отображения и authored source

CLI читает exact metadataSHA из frozen catalogue. Для captured входов ожидаемый displayDensityScale берётся только из original `metadata.manifest.pigmentScale` с совпавшим manifest.commonSHA. Для явно записанного deterministic-fixture он1. Renderer обязан вернуть численно этот scale и input.paper SHA; seedEncodingScale0.5 не заменяет original source scale. Test отвергает неверный scale/paper даже при inputDerivedScale:true.

Authored native требует отдельный certified source-proof sidecar: `{id,inputSHA,originalPlaneSHA,paperSHA,replaySHA,nativeRawSHA}`. Семь originalPlaneSHA должны точно совпасть с componentIsolation, остальные поля — с authored proof и input. Нельзя подставить произвольные семь digest. В существующих старых capture rawSHA есть p/c/coverage/water/foreignWater/original, foreignWater иногда `absent`; из этого автоматически НЕ создаётся семь новых валидных SHA. Отсутствующие actual source-plane/paper доказательства — явный блокер, который должен заполнить оператор/независимый нормализатор. Никакого угадывания aliases water/solvent или foreignWater/foreign.

## Несколько разрешённых immutable builds

`--allowed-builds` обязателен. Ledger: `{catalogSHA256,choices:[{key,builds:[{buildManifestSHA256,sourceHashes,policy}]}]}`. `catalog_identity_sha(plan)` экспортирован: SHA256 UTF8 sorted compact JSON упорядоченного массива choice identity `{key,kind,algorithm?,config?,flags?}`. Список choices не зависит от output/encoding/label.

buildManifestSHA256 — SHA фактических байтов существующего manifest.json; sourceHashes — точный `readBuild(directory).hashes` после проверки всех файлов, не исходного Git commit и не выдуманный subset. Policy worker=`initial-fixed-v1`, native=`native-component-isolated-v1`. Нормализованная solver-клетка обязана иметь такой buildManifestSHA256 и точно тот же sourceHashes, разрешённый для её comparisonKey. Например noncapillary worker может принадлежать final-v1, а четыре capillary — будущему final-v2. Это не старый fallback и не разрешение всех исторических output. Ledger/source SHA сохраняются в итоговых evidence; CPU references имеют отдельные проверенные renderer SHA и не требуют GPU build.

Actual component plane keys: p,c,coverage,solvent,foreign,original,paper. Paper уже входит в семь; отдельный paperSHA должен равняться originalPlaneSHA.paper. OutsideNonzeroChannels содержит ровно material5; backdropGlobalSHA содержит original/paper. Сборщик не требует обнуления фоновой бумаги ради искусственной формы доказательства.

## Частично успешный закрытый batch

Original report.pass:false не переписывается в true. Для успешных строк разрешён explicit closure sidecar, привязанный к SHA всего оригинального report.json, SHA immutable build manifest, точному sourceHashesBefore из отчёта и sourceHashesAfter после независимого readBuild всех файлов. Обязательны verifiedReadBuild/sourceStable/contextClosed true, совпавший report.contextClosed true, errors[] и точный excludedFailedRows — все индексы с row.pass!=true. Вызов worker_cell_from_batch получает row_index, report_sha, closure_sha и closure. Сторонняя/неуспешная строка, неверный report/source SHA или неполный список исключений отвергаются. Остальные raw/input/PNG/renderer/build проверки остаются теми же.

В каждой принятой клетке сохраняется batchScope successful-rows-only-v1 с reportPass:false, reportSHA,closureSHA,rowIndex и excludedFailedRows. Ошибка исходного batch остаётся видимой в progress; успешные клетки не теряются, но не становятся доказательством успеха неисполненных/неуспешных вариантов. Это не автоматический импорт по одному row.pass.

Уточнение счётчика: goalRuns=len(actualcomponents)=expected wet components; waterOnlyRuns=wet−pigmented. Для каждой water-only компоненты zeroCOutputNonzero обязан быть0. Поле coverage nativePigmentedGoalsMinimum не выдаётся за полное число native вызовов. Independent common component counts не подгоняются при расхождении с actual authored source; такой случай требует отдельного source-bound count proof.

Проверка actual conversion: commonWater=min(255,solventA+foreignA), поэтому positive-W topology исходных native7 и captured common совпадает точно (Y-flip не меняет связность). Certified actual-native counts обязаны совпасть и с independent common counts. Расхождение — source/partition bug, не разрешённая смена лужи.

## Честный native-output договор

Все135 comparison choices используют общий optical-picture вывод и один входозависимый scale. Native proof теперь требует nativeCoreActual:true и outputComposite:'common-optical-picture-v1'. Поле nativePresentationExecuted может описывать фактический per-component diagnosticPresentGoal, но **не означает** actual native composite всего merged scene. Нельзя проставлять nativeCompositeActual:true для общего PNG. Подпись: «Исходный расчёт · общий вывод материала». Исторический actual-native composite PNG/SHA сохраняется отдельно как имеющаяся диагностика, не136-й choice и не новая fair carrier-клетка. originalBaselinePreserved относится к исходному source/replay и сохранённой диагностике, а не к совпадению merged common PNG с историческим native-display PNG.

Final worker gate независимо пересматривает actual metadata fineLedger/finalState/coarseLedger. Декларация ledgerAudit.pass:true не может скрыть false guard, ненулевой overflow/capacity counter или ненулевую integer4 delta. None/not-run пропускаются; signed float deltas не превращаются в exact conservation claims.

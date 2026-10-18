# Полная матрица:135 вариантов ×30 сцен

Это **план исполнения**, а не готовые результаты:4050 слотов, из них4020 solver-запросов и30 исходных картинок.135=110 опубликованных choices +24 реально измеренные DSL-конфигурации +новый B-lite с одним `fineSteps:12`. Из135:4native,130worker и1input-reference. Все130 worker-конфигураций проверены actual `assertDefinitionConfig`; непробованные registry presets автоматически не включаются. Никаких диагностических сцен в публичные30 не добавлено.

`review-job-manifest.cjs` строит конкретные запросы с индексами неизменяемого входа/выбора и repeats3. Он не получает GPU/context/device и не вызывает candidate.create. Полный4050-job JSON — приватный `review-135x30-job-manifest.json`; компактный `runnable-coverage-inventory.json` содержит его SHA, входные SHA и ограничения без приватных путей. Индексы choices соответствуют `comparison-coverage-plan.json`. Поля `canonicalNewExecutions`/`allNewExecutions` означают число целевых solver-клеток при полном пересчёте, а не автоматически остаток после использования архивного cache.

## Неизменяемые входы и encoding

15 сцен читают существующие6MiB binary из `flow-all15-catalog.json`: RGBA4MiB, вода1MiB, бумага1MiB. Ещё15 получают детерминированные байты `createFlowFixture`, с SHA исходников генератора. Все30 —1024×1024,seed805, **optical-density**. Полный CPU просмотр всех исходных пикселей: RGB>A=0, ненулевая глубина при A0=0. Дополнительный форматный адаптер для этой матрицы не нужен; это не универсальное свойство всех оптических пигментов.

После перехода134→135 **все30×3 SHA полей остались прежними**. Новый fixed-domain contract не требует менять исходные байты.19 входов совпали с SHA в опубликованных карточках; у11 старых статических карточек сохранённого SHA нет — текущий frozen SHA записан, историческое равенство не заявляется.

Исправлена ошибка старого CPU manifest: generated branch раньше подставляла `premultiplied-rgb`, хотя actual `createFlowFixture` возвращает optical-density. Теперь в запрос проходит `input.encoding`. Regression проверяет именно actual generator → executable worker request. Старые отчёты с неверной меткой не переписываются в валидные результаты новой политики и не используются как новая картинка без проверки.

## Статус на момент snapshot

- **3894 worker jobs:** actual factory явно поддерживает fixedInitialWet, конфигурация валидна. Статус `ready-fixed-candidate-unvalidated` означает возможность запросить проверку, а не device/quality PASS. Функция поддержки сама по себе не доказывает корректный shader/paper/packing на устройстве.
- **0 unsupported worker choices:** все130 выбранных конфигураций имеют явную fixedInitialWet фабрику после capillary commit `0bfa6eee`. Проверка actual registry/config выполнена на CPU; компиляция capillary на устройстве и полная матрица ещё не подтверждены.
- **6 B-lite external results:** mini-wave, sheet12, isolated-pools, one-pixel-wall, water-only, diagonal-wall. У каждого actual fixtureSHA иencoding совпали с immutable input map, а независимый audit совпал с report sourceHashes и raw outputSHA, dryChangedBytes0/invalidPremul0. Это доказательство **точного внешнего отчёта и его замороженного source**, не текущей сборки: `currentBuildCertified:false`. Оставшиеся4 B-lite diagnostics (thin1/2/7/bulk-boundary) вне30; они не превращены в новые публичные сцены. Поэтому B-lite имеет6/30 подтверждённых внешних совпадений,24 отсутствуют, а не2/28.
- **120 native jobs:** доступна новая явно объявленная прямая конструкция `common-optical-seed-v1` из тех же common bytes. Каждый вход требует независимого GL чтения всех native source planes и actual sampled paper, exact common roundtrip и неизменности исходника до/после goal. Ранний proof проверил seed на pool-drop иmini,4goal-руки mini; это не120 готовых результатов.
- **30 input-reference jobs:** solver не нужен; отображаются ровно исходные байты с фиксированным входозависимым оптическим масштабом.

## Native: новая конструкция, не обращение старой конверсии

Для всех30 существует forward seed: native C codes равны commonRGBA, pigmentScale фиксирован0.5, P/coverage/solvent/foreign/original заданы явным договором, paper должен быть установлен во всех settle/passes/ribbon callbacks. Это **synthetic native material**, не восстановленная история кисти и не исторический raw-native checkpoint. Source code SHA и пер-входные GL proofs обязательны. Старые13 canonical +2 authored native-flow replay recipes сохранены отдельно в `historicalNative`; у15 остальных нет исторического native raw/replay, и это не скрывается новым seed adapter.

Обратный common→historical-native перевод по-прежнему необратим: исходная конверсия потеряла P/deposit/foreign/контактную историю и округлила единицы. Новый forward contract не заявляет такого восстановления. Если будущий вход содержит RGB>A, нельзя clamp/подменять A или подбирать scale по результату; нужен отдельный reviewed optical-depth/mass representation, либо явный unsupported.

## Воспроизведение CPU

```sh
node docs/qa/prototypes/805-algorithm-search/review-job-manifest.cjs \
  "$QA_STATIC/flow/comparison.json" \
  docs/qa/runs/805-night-20261017/flow-20261018/webgpu/comparison-coverage-plan.json \
  "$QA_FLOW_CACHE/flow-all15-catalog.json" \
  "$QA_FLOW_CACHE/native-all13-endpoint-scenes.json" \
  docs/qa/runs/805-night-20261017/flow-20261018/native-scenes.json \
  "$QA_FLOW_CACHE/review-135x30-job-manifest.json" \
  "$QA_FLOW_CACHE/fixed-wet-b-lite-results/report.json" \
  "$QA_FLOW_CACHE/fixed-wet-b-lite-audit.json" \
  "$QA_FLOW_CACHE/native-common-seed-gpu-proof.json"
node --test docs/qa/prototypes/805-algorithm-search/review-job-manifest.test.cjs
python3 -m unittest discover -s docs/qa/prototypes/805-algorithm-search -p review_coverage_test.py -v
```

4CPU manifest tests и4coverage tests PASS: без clamp, SHA mismatch отказ, actual encoding propagation, exact external audit matching, native synthetic/nonhistorical distinction, B-lite dedup без добавления diagnostics в scenes. Ни GPU-запусков, ни новых сервисов/сборок этот подэтап не создаёт. Полный manifest должен быть перепроверен против actual frozen registry/source SHA перед запуском; изменения функций поддержки после snapshot не означают уже выполненные клетки.

Финальное обновление source-capabilities после `0bfa6eee`: все130 worker choices поддержаны явно, без fallback; все30×3 input SHA и optical-density encoding неизменны. Измеренная LBM-конфигурация choice82: `{diffusion:0.015,grid:256,steps:16}`, не дефолт48шагов. Поддержка фабрики не считается выполнением дополнительных клеток. Snapshot фиксирует SHA всего actual registry, включая текущие наблюдательные metadata-изменения.

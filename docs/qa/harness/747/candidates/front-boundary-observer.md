# Следующий boundary, только QA

Shared harness пока не изменён. `front-boundary-observer.patch` подключает optional observer; `git apply --check` PASS. Продукт/шейдеры не меняются.

Фактический граф `WatercolorSettlePlan.ts:584–617`: mode10 → outward waterFrontStep (у approved radius40 обычно17 stride8+8 stride1) → mode12 inward seed → inward waterFrontStep → mode11 extended coverage → mode6 band. Observer различает фазы по mode10/mode12 и идентичности field.pressure/mask/band, считает **отдельные реальные waterFrontStep**, не tagged ops. Выбран только первый front одного mono job. Более поздние front groups игнорируются. Coverage/costMax/climb/stride/scale/discreteGrid фиксируются метаданными каждого вызова.

Минимальный следующий gate: `QA_FRONT_BOUNDARY_KIND=seed`; затем `outward`/`QA_FRONT_BOUNDARY_ORDINAL=1`. Если оба exact, ordinal25 (при подтверждённых25 events) и бинарный поиск первого расхождения. `inward` ordinalN и `band` доступны без изменения алгоритма. На один прогон сохраняется ровно одна выбранная плоскость (SHA256 + gzip в private `front-boundary-arrays.json`). Нет26 одновременных12MiB копий. Raw cap по умолчанию16MiB, проверяется ДО readPixels; mono2048×1536 =12MiB. gzip/SHA staging дополнительный, это не общий процессный memory limit. Не performance benchmark.

Обязательны forced-reference payload, normalDITHER, highprecision; нельзя комбинировать с post-reference observer или timing. Вызовы original primitive/аргументы/return values сохраняются; ops, WeakSet tags, samplers и draws не меняются. Shared caller восстанавливает wrappers в finally; ownershipExact проверяется перед сохранением. `discard()` освобождает выбранные CPU bytes при abort. Не считать missing ordinal успешным capture.

CPU mock tests: `node --test docs/qa/harness/747/front-boundary-installer.test.cjs` — 4 PASS: selected ordinal/primitive identity, inward separation/repeated group, CPU cap до read, missing-stage honest failure/restoration. Эти tests не доказывают GPU equivalence. Native GO отдельно.

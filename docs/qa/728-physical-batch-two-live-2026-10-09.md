# Physical batch2: обычная Room, Surface ON

Один bounded ON cohort выполнил пять настоящих Room PointerInput-жестов кистью400: чистая вода, три фиолетовых мокрых штриха, жёлтый мокрый штрих. Перед следующим жестом контроллер явно ждёт canonical idle. Это не непрерывное быстрое рисование и не физическая задержка пера. Source `c2ee56456c27edf619de2371a7406fc703570589`, immutable observer `26eab1c450500de8bd2a3b67e4056ea4993920d5`; batch2 включён настоящим DEV constructor/query, остальные измеренные scheduler/source/AB флаги выключены.

| Жест | DOWN CPU, мс | Первый возврат display после DOWN, мс |
| --- | ---: | ---: |
| Вода | 21.5 | 19.4 |
| Фиолетовый1 | 5.2 | 4.6 |
| Фиолетовый2 | 2.8 | 2.4 |
| Фиолетовый3 | 2.2 | 1.7 |
| Жёлтый | 2.8 | 2.4 |

Возврат display является CPU submission, не доказательством показанного GPU пикселя. DOWN gl.finish0; существующий `_syncContinuationGpu` в этом обычном Room сценарии не вызывался. Записано491 rAF callback (включая явно помеченный QA idle): медианный интервал16.7, максимум83.3мс, пять интервалов>50мс;191 display-call. Из этих данных нельзя выводить physical FPS или точное OFF/ON ускорение новых live gestures.

Функциональные проверки прошли: пять исходных packed stroke операций, согласованный create/join actor и engineActor, GL0/context lost false, public UI Dry/Undo/Redo с ACK и persisted operation IDs. Undo имеет настоящий target со state undone и меняет whole PNG; Redo того же target возвращает state done и exact Dry endpoint. SHA Dry/Redo `ace889ee66e9dcd648263bcae8ce471e43772083221f469d86338028267a3a9d`, Undo `95f718517a0a785fc5e007fccabcf0be173e121db4584bfe1f1f0b2c014f75ee`. Картинки сохранены для просмотра, художественная оценка здесь не заявлена.

**Итоговый verdict остаётся FAIL** из-за POST room thumbnail403, без подавления console/HTTP ошибок. Thumbnail endpoint проверяет live participant+board access либо persisted access, а не только owner (`apps/server/src/roomRoutes/thumbnailRoutes.ts:239`). Same-actor provenance исключает простую смену guest при переходе, но причина отказа ещё не доказана. Это отдельный authorization/infrastructure риск; render/history результаты сохранены до классификации HTTP.

RAM минимум963, после закрытия собственных context/transport1429MiB. Raw и PNG: `temp/fast-watercolor-night/physical-batch-live-corrected-on-surface-20261009/`. Предыдущий live report с потерянными phase/partial оставлен как недостаточная диагностика; он не доказывает failure до input. Hardware не повторялся автоматически. Defaults и production не менялись.

[Exact standalone paired OFF/ON и наблюдаемое сокращение replay на34%](728-physical-batch-two-paired-2026-10-09.md) проверены отдельно; live cohort не подменяет этот same-tape контроль.

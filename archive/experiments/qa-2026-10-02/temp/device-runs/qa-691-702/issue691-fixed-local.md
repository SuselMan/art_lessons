Исправлено локально в `agents/qa-2026-10-02`: `1641a58e` и `bb791820`, base `origin/main=8990c479`. Push/merge не выполнялись; issue оставлена OPEN до мержа и проверки.

Подтверждены три источника расхождения, без повышения порога24:

| Сохранённый native-GPU fixture | До | После AMD/Intel | После AMD/Apple |
| --- | --- | --- | --- |
| Акварель, общий CPU seed +25 операций | max34,33 канала >24 | max3,0 | max3,0 |
| Один реальный угольный жест в исходных world coordinates | max83,71 канал >24 | max3,0 | max1,0 |
| Один реальный маркерный жест, skinny ribbon | max58,3 канала >24 | max2,0 | max1,0 |

Акварель и уголь использовали нестабильный float-fract hash. Lattice теперь запечён в asset и читается NEAREST по центрам texel; interpolation/амплитуды остаются в shader. Уголь усиливал ошибку через grain/dust. Маркер давал аппаратный subpixel tie на почти вырожденной ленте: ribbon vertices привязаны к общей двоичной сетке1/64px, максимум смещения1/128px при прежнем AA ramp1px. Причины проверены отдельными shader-path ablations. Перенос угольного жеста в начало координат скрывал дефект, fixture сохраняет исходные координаты.

Финальная новая комната `a2PX6ql2`, **AMD laptop + Intel Surface + Apple iPad Safari16.3 +17 независимых Socket.IO identities**. 20 участников,10 раундов, все9 инструментов, author undo/redo, reconnect18→20, errors0. После idle ordered IDs/seq совпадают, queue/rebuild/unsettled/peer пусты. Сравнены **16,777,216 сырых RGBA-каналов всех непустых tiles**, без усреднения: AMD/Intel **max17,0 каналов >24**, AMD/Apple **max15,0**. Поздний независимый AMD witness: тот же журнал, **max2,0** относительно живого автора.

Permanent runners: `watercolorParity.mjs`, `charcoalParity.mjs`, `markerRibbonParity.mjs`; gzip fixtures отслеживаются в `e2e/fixtures/`. QA-022/024 в `docs/qa/scenarios/collaboration.md`; полный отчёт `docs/qa/runs/2026-10-02.md`. Raw/gzip/metadata/stage comparisons в `temp/device-runs/qa-691-702/`, финальные `final3-fixed-*`, `late-witness-*`, пути fixture captures в `final3-regressions.log`.

Смена hash меняет конкретные узоры шума нового replay. Старые CPU snapshots сохраняют уже записанные пиксели. Побайтная одинаковость разных GPU не заявляется: критерий24 сохранён, редкие малые различия остаются.

Финальные checks:3420unit/269files PASS, typecheck, lint:fix, map:check/map:rules, production build PASS (baseline warnings перечислены в отчёте). Все6 native browser scenarios выполнены: five-author watercolor continuation/undo/redo/late replay, filter delete/undo и4 context-loss cases. Первый context-loss case однажды не дошёл до редактора из-за `ERR_CERT_VERIFIER_CHANGED` при загрузке JS; отдельный повтор на том же коде PASS. Оба результата/trace сохранены.

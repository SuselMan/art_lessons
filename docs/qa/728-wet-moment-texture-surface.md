# #728: DEV coupled moment texture gate — Surface, 08.10.2026

Проверен новый экспериментальный оператор, не production модель и не обычная Room. Frozen source `b3639254`, immutable run.js 33.5KB и index.html сверены по HTTP SHA256/manifest перед запуском. Реальный Chrome Surface, actual WebGPU; синтетические canonical RGBA8 P/C 17×13, нечётные границы, полный output против CPU oracle. Каждый arm создавал свой GPU device и уничтожался; закрыта только собственная вкладка.

| Arm | Результат | Различия / max | GPU errors |
|---|---|---|---|
| Zero-rate pack/unpack | PASS | 0 / 0 | 0 |
| Coupled P.B/C transport против CPU oracle | PASS | 0 / 0 | 0 |
| Unsupported carrier C>P.B | PASS: invalidChannels=1, весь ROI unchanged | 0 / 0 | 0 |

Оператор сохраняет P.R/G/A, перемещает P.B и четыре C оптических момента совместно. Все суммы проверены CPU oracle; GPU output точно совпал. Carrier gate не исправляет неподходящую краску clamp'ом. Текстурный Q8 pack/unpack доказан для этой fixture/устройства; реальные Room source/film records и художественная натуральность пока не проверены.

RAM: preflight1992MiB, минимум1772MiB, после own-tab close1833MiB; guards1700/500 не сработали. Дополнительный integer-storage `runMomentGate` после трёх successful texture arms не завершил сравнение: helper вызвал `getMappedRange` дважды на пересекающихся диапазонах, WebGPU API отклонил второй вызов. Это ошибка диагностики, не установленный shader/model failure. Helper исправлен офлайн на единственный snapshot; дополнительных аппаратных повторов не делали.

Raw остаётся локально: `temp/fast-watercolor-night/moment-texture-surface-20261008.json`. Время этих запусков не выдаётся за GPU/operator timing или задержку пера. Следующий gate — настоящий source landing текущей Room: carrier аудит actual P/C, current canonical contact и обязательный rebase film перед следующим MAX merge. DEV OFF/defaults остаются без изменений.

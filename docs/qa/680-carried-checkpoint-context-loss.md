# #680: GPU-снимки заливок после потери контекста

Исходники исправления: b8f1bbc8, отдельный аппаратный стенд 5309.
Модель/шейдеры/P/C/V не менялись. При actual WebGL loss удаляются checkpoints,
которые несут GPU-снимки открытой заливки; packed CPU snapshots сохраняются.
Удаляется весь mid-wash checkpoint, поскольку его prefix без open-state
не позволяет правильно дорисовать хвост. Dispose вызывается под contextLost.

CPU: 6 context-restore tests PASS, настоящий app typecheck PASS.
Новый regression проверяет удаление carried checkpoint, сохранение packed
snapshot и отсутствие framebuffer bind при loss.

Аппаратная Vega, тот же сценарий, который упал на immutable 3d:
после 24 native жестов, Dry и Undo/Redo существует настоящий carried
checkpoint с 16 op IDs, одним wash ID и одной tile. После actual loss
carried checkpoints отсутствуют; новая peer operation приходит в
подтверждённый журнал, пока recipient действительно contextLost.
Restore: faults=[], GL0, canonical изображение непустое (73814 px),
authoritative A/B/fresh payload/seq совпадают. Baseline имел шесть GL1282
bindFramebuffer в RibbonStrokeScratch.restore через _seedWashes.

Это подтверждает исправление dead-FBO lifetime, **не** pixel parity.
Round2 A-restored/fresh: 23981 raw RGBA pixels, alpha delta max42,
199 pixels с max delta>8, premult RGB max21.9373. Native B/fresh:
24031 pixels, те же alpha/max>8/premult показатели. Raw RGB max255
относится к alpha1..3; заметные premult расхождения этим не объясняются.
Round3 A/fresh отличается на20036 pixels.

Прогон дошёл до round4/40 native жестов, около8.9мин actual работы,
GL0 и RAM headroom около2.1GiB. Затем оставшийся fixture assertion
B packed rejoin != fresh остановил тест. Это unresolved pixel FAIL,
не20мин stability PASS. Chrome закрыт finally. Дальнейший controller
сохраняет B-rejoined PNG и raw/premult delta отдельно, сохраняет
nonempty/authoritativejournal/GL/RAM500MiB строгими.

Raw артефакты на домашней машине:
`680-carried-wash-restore/temp/context-loss/carried-stability-headroom/`:
report.json и PNG A/B/fresh по раундам. Копия полного отчёта на VPS:
`680-context-restore/temp/context-loss/carried-stability-headroom-result.json`.
Baseline: `680-paper-dry-replay/temp/context-loss/stability-two-engine/`.

Предшествующий patched round0 был остановлен RAMguard500MiB до
carried checkpoint и не является аппаратной проверкой фикса. Headroom
освобождён остановкой только проверенных завершённых QA Vite-сервисов;
пользовательские стенды не изменены.

## Offline разбор round2

A-restored против B-native: 204 pixels, raw max5, alpha max1,
0 pixels >8, premult RGB max4.7647, bbox539,1341..569,1417.
Большая разница с fresh общая для обоих авторов, а не специфична restore A.
У199 pixels >8: top zig60, middle straight36, bottom straight103;
118 имеют alpha>100, только7 alpha<=5. Около90 находятся в20 worldpx
от ближайшего конца траектории; ни один не в20px от detected turn center.
Повторные штрихи лежат по совпадающим траекториям: nearest-op attribution
не доказывает, какая операция создала конкретный пиксель.
На белом фоне сравнение выглядит очень близким; difference×8 показывает
рассеянные отличия зерна внутри и вдоль контура всех трёх фигур.

Все изображения1754×2480, все stroke на layer-1. Raw A/B содержат28ops,
fresh27: отсутствует только paper_dry bC1VlmpSaT, возраст236448ms,
что соответствует намеренному server expiry120000. Semantic authoritative
oracle сохраняет exact serverseq/payload всех оставшихся операций.
Это не идентичные chronological barrier lists, но не доказанная причина:
все pre-Dry strokes aged247–322сек и должны уже исключаться существующим
PaperWet age-filter независимо от barrier. Нужен отдельный matched replay
контроль с/без expired Dry, прежде чем приписывать ему canonical difference.
Float32 причина также не установлена этими данными.

Bounded offline artifacts на VPS:
`temp/context-loss/carried-round2/compare.png` (1440×558),
`temp/context-loss/carried-round2/diff-x8.png` (480×530),
`temp/context-loss/carried-round2/analysis.json` (полные координаты199pixels).

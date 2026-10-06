# #680 — сетевой снимок и ещё мокрые источники

Принцип: сетевой снимок хранит пиксели, но не ephemeral PaperWetness и independent solvent V. Поэтому сервер не должен исключать из join tail операции, вода от которых ещё доступна. Возможность продолжить старую wash и доступность её воды — разные условия.

До изменения clearwater→pencil одного автора закрывало _openWashes; layer snapshot мог покрыть донор. Fresh join восстанавливал только pixels, а backfillHistory (best-effort после открытия комнаты) лишь дополнял журнал и не восстанавливал воду.

hasActiveWater получает doneOperations, удерживает quiet gate для целевого слоя при watercolor water>0 до WET_DRY_MS. paper_dry и layer_clear прекращают предыдущую воду, чужой слой не влияет. Старый open-wash gate сохранён. Контракт snapshot и операция не меняются. Future timestamp консервативно удерживает gate, как replay age0.

Проверено: пять CPU-тестов lifetime/order/dry/clear/otherlayer/undo/redo/revoke и один engine _snapshotQuiet тест: openWashes пуст после переключения на pencil, quiet целевого слоя false; другой слой и отменённый донор допускаются. Web typecheck PASS. Новый worktree имеет собственные npm зависимости и собранный shared.

Реальный StoredSnapshot softwareWebGL fixture находится в temp/snapshot/stored.mjs. На момент первоначального коммита ещё не завершён; не считать CPU-проверку доказательством real server restore. Его задача — сухой слой R действительно хранится как blob, мокрый L остаётся в tail, третий участник восстанавливает R и получает clearwater payload/PaperWetness. Software QA не измеряет производительность или GPU-паритет.

## Реальный сетевой снимок на Vega

Изолированная домашняя копия production source f99d43ea (clip + этот guard), порт5305. Chrome/ANGLE AMD Radeon Graphics, три собственных cookie-context A/B/C. A создаёт сухой R, мокрый L: clearwater seq98, затем pencil seq99 того же автора. _openWashes пуст, _snapshotQuiet(L)=false. A подтверждает rename seq100; штатный uploader сохраняет настоящий R/layer-1 snapshot100. L отсутствует в индексе. Fresh C проходит Roomjoin, получает HTTP200 blob /snapshots/layer-1/100, а clearwater остаётся подтверждённым serverSeq98 в join-tail (backfill не ставит serverSeq). C PaperWetness peak0.9791134, sample0.979025. GL0, lost=false, pageerrors[]. Все собственные Chrome-context закрыты. Артефакт temp/snapshot/hardware100-report.json, executable temp/snapshot/hardware100.mjs.

Ограничение software-попыток: никакого PASS. Были timeout после actual100ack, затем отдельный исчезнувший tunnel/ECONNREFUSED; ретроактивно это не объясняет все timeout. Последний software99 при healthy tunnel действительно собрал R raw4194324/gzip5729 и Lnull, но bake/compress/POST занял146.5s; сервер вернул403 forbidden, восстановление не выполнено. Thumbnail-off не исправил software100. На genuine Vega automatic100 прошёл быстро; production/performance баг из software-таймингов не объявляется.

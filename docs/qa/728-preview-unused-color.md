# Удаление нечитавшегося цветового intermediate preview

Кандидат от root4ad7dfc92cdae105479d8d938907ceba6558d0fc.
Принцип: удалить вычисление результата, который конкретная ветка не читает;
физические поля, stencil, rAF и интервалы admitted preview не изменять.

В WatercolorSettlePlan.present при S>1 и single-paint (colour=null) тайловый
цвет восстанавливается из полного tile load через pigmentColor(chroma,load).
Предварительный field color в этой ветви нигде не читается. Кандидат убирает
только его acquire, full-field pigmentColor draw и release. Pigment intermediate,
tile pigmentColor/copies/coverage/callback и canonical операции прежние. Для
S1 и mixed paint field color по-прежнему вычисляется и освобождается.
CanPreview/частота/ownership/source/rebase в этом commit не меняются.

Actual Plan tests:71 PASS, включая пять новых случаев. Проверены реально
достигнутые half-resolution single/mixed и full-resolution single first preview
quanta: соответственно1/2/2 private field allocations. Tile color consumer
сохраняется. Dispose и context-loss между snapshot quantum и tile callback
освобождают held owners; lost names не возвращаются в pool. Старая исходная Plan
проваливает три relevant negative tests (лишняя вторая allocation), при этом
S1/mixed negatives проходят. Scoped TypeScript PASS, git diffcheck PASS.

В MockGL проверяется командная граница и ownership, не RGBA шейдеров. Требуется
отдельный actual hardware same-tape gate S>1 single-paint с presentation/canonical
RGBA equality и count removed draw. 9MiB соответствует1536²RGBA8 field, не
доказанная экономия полной памяти engine. Не доказано, что эта ветвь вызвала
950ms rAF gap trace1419: в той трассе S/individual pass labels не сохранены.
Аппаратные проверки, обновление runtime и публикация здесь не выполнялись.

CPU raw (ignored): temp/preview/{tests.log,types.log,old-negative.log}.

## Actual Vega A/B, 7 октября 2026

Собственный HTTP5334, две immutable namespace BASE4ad7/CANDIDATEc740,
987 tracked web/shared SHA каждой копии проверены. One Chrome, one engine
at a time; preflight MemAvailable2000MiB, наблюдавшийся минимум884MiB
(выше500MiB), после Chrome close1685MiB. Source/defaults не подменялись.
Paper fine, board1754×2480, display canvas1280×900. Все шесть arms GL0/lostfalse,
nonempty P/C/coverage preview и material P/V guards достигнуты.

S2 и S1 получили одинаковые immutable PointerData batches, stable logical IDs
и одинаковые timestamp samples; actual native packed stroke payload совпал
после исключения только operation id/timestamp/userId. S2: scale2 реально
достигнут. Mixed negative использует два actual `_paintDabs` набора разных
цветов в одном scratch, metadata paints2, S2. Это direct-Dab material fixture,
не native Room/serverACK/reconnect claim.

| Случай | Full-field pigmentColor BASE→candidate | Tile pigmentColor | BeforeDry material | Whole Dry decoded RGBA |
| --- | --- | --- | --- | --- |
| S2 single | 4→1 | 44→44 | exact12 buffer records | exact |
| S1 single | 4→4 | 0→0 | exact6 buffer records | exact |
| S2 mixed | 0→0 | 0→0 | exact24 buffer records | exact |

Один оставшийся S2 full-field color draw принадлежит canonical reconstruction;
три admitted preview draws удалены. Mixed field color вычисляется через paired
fieldOp, поэтому pigmentColor count0 не означает отсутствие его consumer.

Matched job.next+tile preview P/C/coverage полные raw SHA exact: S2 два tile
captures приjob1/next37; S1 три captures next36/44/64; mixed шесть next37/38.
Capture cap6. Wallclock150ms presentation gate допускает разные более поздние
preview ordinals (например S2 next46/56 против45/53). Их не выдаём за paired
pixel/timeline equality. Все tile material PNG сохранены, а wholefinal oracle
декодирует PNG и сравнивает полную RGBA, не только encoded SHA.

Diagnostic readbacks были внутри preview callbacks: это не FPS benchmark,
не доказательство устранения950ms trace1419 gap и не throughput improvement.
Никаких дополнительных hardware волн после PASS. Session86502 exit0,
ownedChromeClosed=true; GPU передан root немедленно.

Raw HOME:
`680-water-wet-tone-qa/temp/preview-color-c740-4ad7/temp/first/`.
Компактный VPS report: `temp/hardware/final-report.json` этой рабочей копии.
Controllers: `temp/hardware/preview-color-{run.mjs,function.js}`; embedded parse
проверен до запуска. No push, no userstand update, no runtime default enabling.

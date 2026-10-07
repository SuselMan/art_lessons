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

## Аппаратное сравнение и интеграция

Vega, immutableBASE4ad7/CANDIDATEc740 по987sourceSHA. Six sequential arms,
S2single/S1single/mixedtwo-color; sameinputSHA, одинengine за раз. Report
completedtrue/ownedChromeClosedtrue, всеengineClosedtrue/GL0/lostfalse.
Root независимо прочитал `728-preview-unused-color/temp/hardware/final-report.json`.

Во всех трёх парах wholeDrydecodedRGBAexact и beforeDrymaterialSHAexact.
MatchedpreviewP/C/coverage exact на2/3/6ordinals соответственно; остальные
непопавшие вcapturecap кадры не считаются проверенными. S2fieldcolor4→1,
tilepigmentColor44→44; S1field4→4/tile0→0; mixedfield0→0. PositiveP/C/V
guards достигнуты. Mixed — directDabfixture, не Room/ACK проверка.

Интегрировано root5077eecc. Productionchange только удаляет нечитавшийся
intermediate; shared/shaders/physics и cadence не изменены. Fullengine
проверка запущена, no FPS/initialhitch speed claim. User5329 покаd88.
RawHOME:`680-water-wet-tone-qa/temp/preview-color-c740-4ad7/temp/first/`.

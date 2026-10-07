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

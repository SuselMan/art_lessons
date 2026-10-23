# CPU сопоставление trace1419 с d88, без нового hardware

Данные: trace.json / analysis.json / queue-before-gap.json. Период950.859ms
между FireAnimationFrame233675364702 и233676315561. В trace присутствуют реальные
Queue callbacks (трансформированный WatercolorSettleQueue.ts:97), но нет job ID,
next/ops length или GPU pass labels. Поэтому конкретный front/carry ordinal из
этого capture восстановить нельзя. User timing marks обозначают начало stroke,
возврат pen helper (уже после1500ms tail), UI Dry и окончание tail, не каждый op.

В400ms перед паузой есть6 Queue callbacks, последний233675364409 длится200us.
Перед ним JS tail callback принятия второго касания233675095504 длится61.839ms.
GPU service получает WebGL command batch put_offset146331 в233675187321:
CommandBufferService:PutChanged164.704ms. Это время обработки service batch,
не измеренная аппаратная длительность шейдера. На последнем rAF перед паузой
engine _scheduleDisplay callback (served index.ts:8050) длится2.864ms.
Затем появляется SharedImage1670×2395 и длительная серия GPU PerformWork;
compositor пропускает56 кадров, пока main timers продолжают выполняться.
Сопоставление показывает накопленный submit+display/backpressure после nexttouch,
но не доказывает, что виновен именно waterFront, carry или один draw.

Код d88: Queue.tick advance исполняет1 op (либо ускоряет backlog); frontStepOp
оборачивает chunk до4 waterFrontStep draws. Первыйfront seed mode10, затем
unit-stride outward, inward, coverage/band/gather; carry chunk содержит до4
mode15 draws плюс present. prepare/stitch captures выполняется сразу. Новое
касание и queued logical finishes могут накопить work прежде кадра presentation.
Purewater sourceP=0 не означает отсутствия solver/front/copy/presentation work.

Следующий причинный capture должен пассивно поставить performance.mark до/после
Queue.advance с stable jobID,next,len и до/после passes.waterFrontStep/fieldOp
(mode15/16) и display, без GL queries/finish/readback. Нужны actual modes/counts,
не String(op) или вычисление стадии по порядковому времени. Исходную950ms
трассу не выдавать за pass-attributed GPU measurement.

Две узкие OFF/ON проверки на одном immutable actual input tape400px/3s/A4:

1. Submission quantum: исходные операторы и их порядок сохраняются, front/carry
   chunk4 разбивается на single draw (существующий splitQuanta при честном
   owner eligibility), либо существующий per-op GPU budget fence. Не включать
   несколько механизмов сразу. Проверять actual reachedflags/count/order,
   P/C/V/coverage+whole endpoint exact. Цель: различить большой накопленный GPU
   batch от суммарной работы. Sync-вариант сам добавляет stall, поэтому сравнивать
   longest task и rAF tail отдельно, не приписывать JS time shaderduration.

2. Zero-field work ablation: только чистая вода в свежей комнате при доказанном
   P/C source zero; noCarry (существующий ctx.ab) убирает14mode15 и ихpresent,
   waterFront/coverage/V и geometry неизменны. Сначала raw nonzeroV/coverage и
   zeroP/C guards, endpoint V/coverage+wholeRGBA exact. Еслиgap уменьшится,
   это указывает на ненужный pigment transport/presentation submit при zeroP,
   не разрешает удалить waterFront или менять физический домен. Отдельный
   presentation-noop вариант нужен для разведения carry draw и presentcopy;
   не объединять его с noCarry в причинном сравнении.

Всё выше — предложение диагностик, не выполненный GPU AB и не production fix.
No GPU/source/stand changes на этом CPU этапе.

## Следующее CPU предложение: сокращать redundant copies, а не rAF

Sync-budget fence уже отрицательный (root a1ea/a0f), не повторять.
`_displayIfNotSuspended` УЖЕ вызывает coalesced `_scheduleDisplay`, поэтому
предложение просто заменить immediate display на rAF здесь было бы повтором
существующего механизма. Физические tick/preview150ms/rAF не отбрасываем.

Конкретный найденный dead presentation draw: в present/reconstruct всегда
выделяется full-field `color` и при singlePaint выполняется
`pigmentColor(color,pigment,singleTau)`. Но если S>1 и colour===null, каждый tile
использует `pigmentColor(chroma,load,singleTau)` после fullresolution fromField
pigment. В этой ветви field `color` нигде не читается. Поэтому при строго
S>1 && !colour можно не acquire/compute/release presentation color field,
сохранив pigment field, tile load/chroma/coverage и callback/rAF без изменений.
Это снимает один full-field shader draw на каждый admitted preview и один
checked-out buffer (1536²=9MiB), без изменения физического solver/canonical
оператора или последовательности tile writes. Для S1 или mixed colour путь
должен остаться дословно прежним. Нужны fakePass command-census negative S1/mixed,
actual offset/background presentationRGBA и canonical endpoint equality.
Предположение S>1 в1419 пока НЕизмерено: не приписываем уже950ms этой dead ветви.

Вторая узкая граница: callback в engine отвергает tile, когда отсутствует его
held reveal, владение `_washReveals` изменилось, активен новый stroke или пропал
scratch entry. Present уже сделал до этого whole-field/tile copies. Можно добавить
read-only `canPreview(tile)` admission до tile allocation/copy и global
anyEligibleTile gate до field reconstruction. Predicate ровно существующие
callback условия; никаких pixel-derived thresholds и никакого уменьшения частоты
при eligible target. Проверять predicate повторно на каждом continuation,
owner cancel/loss должен return generator и освобождать owned copies. Active
predicate уже имеет opt-in shouldPreview/suppressActivePreview; не выдаём этот
частный existing guard за новую оптимизацию и не повторяем drain suppression
как неизмеренный выигрыш. Новая часть — tile reveal identity/entry eligibility.

Input stitch/snapshots/a0/ca0 и runningFilm rebase НЕудалять: они закрепляют
logical boundary и нужны nextchunk/cancel/replay. Экономить их по zeroP без
проверки fixed/history P нельзя. PurePlan79 отдельно исследует доказанный empty
material, не основание для общей source-copy оптимизации.

Следующий causal AB для dead color должен сохранить те же actual tape и
150ms eligible preview moments; census fieldColorDrawOFF>0/ON0,
tile pigmentColor counts unchanged, S>1/singlePaint reached. Сравнить endpoint
P/C/V/coverage и presentationRGBA на одинаковых solver checkpoints. Timings
отдельно: active/tail/whole wall; task submission не равен shader GPU duration.
Эти предложения пока CPU-only; не реализованы и не включены на5329.

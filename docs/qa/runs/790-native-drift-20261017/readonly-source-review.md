# M70 single-gesture drift после board turn: read-only RCA

Native вход source `f6a27f987c1ea63ce3924b4d541b5a32e0f391b7`.
Релевантные engine/painter/codec/controller файлы readonly integration HEAD на
момент проверки не отличаются от этого source. Ничего runtime не менялось. Первоначальный readonly разбор дополнен ниже
одним bounded CPU pointer-input экспериментом; новых GPU/сервисов не было.

Исходный native результат другого агента: B single trusted watercolor+Dry exact
ownOFF fullAPI, затем board turn вA с таким же принятым M70preset —956different
channels, ошибокнет. В первоначальном FAIL не сохранены actualhash/max перед
assert, поэтому это неполный pixelproof. Отдельный bounded повтор выполняет
владелецnativeустройства; не выдаём причину за доказанную.

ReadonlyAPI A/B: обеистории ровноlayer_add→stroke→paper_dry, один layer,
7packed dabs, preset normal95:34PB29roundwc@m70-r2-v1, color[.1,.25,.8], wetнет.
Packed x/y/size/pressure/opacity одинаковы; различаютсяt,strokeId ислужебныеID/time.

* A t:0,410.1000061035,511.3999938965,614,614,614,614.
* B t:0,306,512.700012207,618.5,618.5,618.5,618.5.
* x:219.9999847412,227.0399780273,234.0799865723,237.1998138428,
  240.3196563721,243.4394836426,246.5593261719; y220.
* Начальный size19.9669418335, следующие27.7318630219, tailуменьшаетсядо12.4793376923.

## Что проверено по коду

Room engine effect зависит отboardId и retireEngine/destroy создаёт новый engine.
_onStart отказывает доpaper.loaded. _strokePreset получаетtag текущей модели до
рисования; paintprofile читается изэтогоtaggedpreset. Переданный sourceprofile
доtag использует те же ink/normalize=true/true; конкретного различия здесь нет.
Live _strokeId=puddleGesture, и этот же strokeId записывается вop и даётpaintseed.
Controller epoch относится к invalidation/presentation, не кshader seed.
РазницаDate.now наDOWN иrecordedUP не достигает120s, предыдущегоstrokeнет.

## Проверка гипотезы F64/F32: опровергнута для фактического материала

Первый readonly разбор ошибочно остановился на rawF64 recordingbuffer в
`_paintStrokeDabs`, не проследив следующую ветку. Это исправлено исполнением
реального pointer пути и чтением существующего кода.

В `_paintDabs` (index.ts7854–7870) уже есть `dabs.map(codecDab)` и такой же
codecDab дляprevDab ДО `_paintRibbonDabs`/CPU material geometry. Helper
`src/dabs/codecDab.ts` делаетMath.fround всех10полей codec. Это старое исправление
`b8d75596` (#680), а не новый кандидат. `_strokeDabs` вправе хранить F64; материал
получает F32. Сам факт37различийraw-vs-packed наnative не доказывает drift.

Новый положительный CPUтест регистрирует реальные DOM pointer listeners нового
PencilEngine и вводитpointerdown/move/up черезPointerInput→DabSystem. Он не
авторитготовыеdabs/packedops. Захватываются фактические leaf-inputs
RibbonStrokePainter.paint, drawRibbonNibPass geometry и конечные CPUscalars;
независимый engine проигрывает сохранённые операции через appendOperation.

Две fixtures: короткийштрих среальнымUPtaper и длинныйжест с автоматическим
800dabchunk (несколькосохранённыхops). Recordingbuffer содержит nonF32поля,
но фактически переданные materialinputs точно равны strokeDabs записанныхops.
Новые runtimeправки/format/общийfroundfix не нужны. Nativeповтор другого агента
021d9245 с37rawокруглениями накаждомboard дал0pixel difference; исходный956не
воспроизвёлся и остаётся не объяснённым этим axis.

CPUэксперимент используетMockGL и подменяет ТОЛЬКО presentation shaders;
material deposition, controller/source, реальные pointer normalization и replay
остаются действительными. Он не доказывает native solver RGBA parity.
Не объединяем автоматически этотfinding с ранее редкими5byteclosedDry mismatch
илиownership #785. Новых GPU/сервисов этот агент не запускал.

Итог исполнения: 2целевыхтестаPASS; actualmaterial arrays, renderer dab arrays и
выбранные CPUscalars author/replay exact. WebTypeScript/scopedlint PASS. Runtime
не менялся. Послеэксперимента selecteddependencylinks и generatedshared удалены;
собственных процессов/browser/GPU/сервисов не осталось, source/history сохранены.

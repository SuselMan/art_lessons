# M70 single-gesture drift после board turn: read-only RCA

Native вход source `f6a27f987c1ea63ce3924b4d541b5a32e0f391b7`.
Релевантные engine/painter/codec/controller файлы readonly integration HEAD на
момент проверки не отличаются от этого source. Ничего runtime не менялось;
новые GPU/CPU тесты, процессы, сервисы и dependency links не запускались.

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

## Конкретный открытый axis

Live `_paintStrokeDabs` рисует и сохраняет rawJSF64 dabs. ТолькоUP/chunk вызывает
packDabs, который setFloat32 округляет все10полей. Replay декодируетF32.
В dabCodec это прямо описано как precisionloss. ПредварительногоMath.fround в
живомпути нет. M70 рассчитываетtravel/trail/dose/scalars наCPU доGL, поэтому
равенствооднихGPUuniformF32 не доказывает равенствоCPUветвей/результатов.
Наэтомвходеdistances7.04/3.1198 далекоотtravelquantum≥1.5: пропускцелогоdab из-за
пограничногосравнения пока неподтверждён. Но dab.t влияет наtrail/dwell/brake,
после чегоtinyразница может пересечь packedrounding и усилитьсяsolver.

Необходимое следующее доказательство: raw_strokeDabs/uniforms ДОUP сравнить с
accepted decoded dabs и сырымиP/C/water/canonicalfields live/replay. Nativeоператор
получилэтотaxis; новыхзапусковэтотагентнеинициировал. Ни froundfix, ни общийguard
без такого baseline не внедрены. Не объединяем автоматически этотfinding с
ранее редкими5byteclosedDry mismatch илиownership #785.

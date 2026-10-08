# Следующий DEV seam: P.B и C moments совместно

`wetBrushMomentRecipe.ts` — offline подготовка контракта, не включённая в Room.
Enabled=false по умолчанию: не выделяет recipes и не двигает CPU state. ON
принимает уже production retained dabs **один раз**, создаёт immutable ordinal,
quantized world point/pressure и направление. State переносится между chunks;
стационарная точка сохраняет последнее движение, live clock не используется.
Радиус в recipe — bounds hint, не альтернативная геометрия: actual contact должен
растеризоваться существующими canonical coverage commands, включая nib/pressure/
bristles. Recipe не заменяет DabSystem и не пересчитывает dose.

## Coupled carrier, а не переливание tracer в production

Pigment mass M=P.B в Q8 units0…255, C четыре optical moments. Действует explicit
subset guard `0<=Cj<=M`. Неконформный фактический record — unsupported, а не clamp.
Пока неизвестно, все ли реальные tau/settle records удовлетворяют ограничению:
это первое read-only hardware gate перед интеграцией.

Если массы равны, обычная diffusion разницы M ничего не делает, хотя цвета могут
различаться. Поэтому mix обменяет одинаковую дозу q из каждой стороны:
q=floor(min(Ma,Mb)*wet*mixRate). Каждый donor передаёт floor(Cj*q/Mdonor).
Массы после symmetric exchange прежние, цветовые moments смешиваются. Затем
направленный перенос t меняет mass и переносит пропорциональные moments.
Targetcapacity ограничивает t до255−Mtarget. **Для каждого шага** точно сохраняются
Ma+Mb и Cja+Cjb. Ни один момент не создаётся/теряется.

Почему bound сохраняется: incoming moment<=incoming dose; для остатка
C−floor(C*t/M)<=M−t при0<=C<=M. Для equal-dose обмена
C−floor(C*q/M)+incoming<=M, потому что incoming<=q и
floor(C*q/M)>=C+q−M. Эти integer inequalities покрыты capacity/direction fixtures.
Малые Q8 дозы могут pinning из-за floor; качество/естественность пока не оценены.
Если actual C>P.B, нужен расширенный bounded optical-density carrier с паспортом,
не молчаливое приведение или выдача этого subset за полную production модель.

## План GPU owner

После исходных P/C landing и импорта foreign V, до settle capture, отдельный DEV
owner выполняет парные checkerboard passes в **том же мокром поле**. Контакт —
actual prepared coverage.A; wet — явно определённая общая solvent availability,
одинаковая для own/foreign water. Не выбирать coverage канал по догадке.
P.R/G/A сохраняются; только P.B и C переносятся совместно. Source/out P/C разные
ресурсы (нет read-write texture feedback), ping-pong и explicit barriers/pass order.
OFF вообще не кодирует новый pass. Ошибки/unsupported не делают silent fallback.

Для400px footprint ROI примерно400×400: четыре paired passes =320000 paired
invocations, приблизительно48bytes read/write на пару (~15.4MB/dab, без caches).
При106 retained dabs ~33.9million pairs/~1.6GB traffic. Это **верхний расчёт
работы, не замер времени** и потенциально дорого. Coarse physical grid/меньше
passes изменят новую модель и должны идти отдельным A/B; exact optimization:
scissor ROI и batching encoders без изменения paired sequence. Нельзя запустить
full1024 grid для каждой маленькой brush ROI по привычке.

## Gate и следующая интеграция

1. Actualfield CPU audit C<=P.B, common V channel semantics, no orphan C at M0.
2. Same-input GPU pair CPU oracle exact on two GPU; each moment/mass sums exact.
3. Own/prior water same deposition/availability, interrupted chunk author/replay
   exact; fixed dense400/two-colour journal, defaultOFF original whole hashes.
4. DEV normal Room owner routing, singleboundedtile first; Undo/rebuild/foreign
   wash/scoped resources explicit. Нельзя вставлять extra callback на per-tile
   prepareDelivery и повторно двигать clocks.

CPU4 tests PASS: OFF noadvance, whole/chunk recipes exact incl stationarydirection,
equal-mass hue mixing, mass/moment conservation over capacities/directions,
drygate и explicit unsupported optical record. Actualapp typecheck PASS.
GPU реализации/Room подключения в этом коммите пока нет; это следующий
reviewable CPU-contract шаг, не готовая интеграция.

## Реальный coupled GPU оператор (следующий атом)

`wetBrushMomentGpu.ts` содержит WGSL compute pass для Q8 P.B + C.RGBA, CPU oracle и строгий аудит записей. Хранение временно integer storage, десять u32 на пиксель: P.RGBA, C.RGBA, общий wet Q8, реальный контакт Q8. P.R/G/A, wet/contact сохраняются побайтно; перемещаются только масса P.B и четыре оптических момента. Соседние пары не пересекаются, каждый выходной пиксель имеет одного писателя, включая непарные границы нечётных размеров. Все операции деления целочисленные и имеют тот же порядок, что CPU oracle. Вход неподходящего carrier не исправляется: CPU pack отказывает, GPU дополнительно считает invalid pairs и сохраняет такую пару неизменной. Любой invalid pair делает эксперимент неуспешным: его результат нельзя публиковать в обычную Room.

В production `pigmentOptics.ts` ограничивает transmittance снизу .02 и использует depth scale 4: τ/4 ≤ .978006. Source stamp/ribbon записывают C.rgb=amount·strength·τ/4, C.a=amount·strength, P.b=amount·strength. Это доказывает непрерывный source bound, **не** доказывает bound после независимых Q8 растеризаций, MAX/ADD и settle. Поэтому `auditMomentRecords` проверяет каждый actual пиксель, сохраняет count/maxExcess/первые координаты нарушений; агрегатные sums/max недостаточны. В исходных сохранённых отчётах есть агрегаты, но нет пары полных исходных P/C byte arrays для такого доказательства.

Общую воду production shader декодирует как `available.b / max(available.a,.002)` из фактической карты availableWater; P.R и coverage.A по отдельности этим источником не являются. Моментный оператор пока принимает уже подготовленный wet Q8 и реальный контакт, не выбирает запись по имени и не повторяет delivery.

`runMomentGate(actualFixture?)` доступен из `run.js`: 32 actual compute passes, полный integer output vs CPU oracle, invalid count и WebGPU errors. Без actualFixture результат явно synthetic. submitAndReadbackMs включает fence/readback и не является GPU timing. Офлайн пройдены 4 unit tests, полный apps/web typecheck, strict harness TS, oxlint; GPU компиляция и hardware gate ещё не выполнялись.

Обычная Room должна вызвать будущий owner seam после once-prepared source landing и до production settle: фактические inkLoad/inkColor (либо согласованная running-film пара), availableWater и canonical contact footprint; записанный contact ordinal и направление определяют четыре pair passes. Нельзя вызывать seam ещё раз на каждый tile с повторным CPU advance. DEV OFF возвращает до создания pipeline/buffers и оставляет прежнюю последовательность владельца без дополнительных команд. Следующий необходимый атом — GPU texture pack + глобальный bound audit + pair passes + guarded unpack, иначе текущий integer-storage kernel не является Room интеграцией. Cross-tile flux, насыщенные/неподходящие carriers и foreign ownership требуют явного отказа, не молчаливой подстановки.

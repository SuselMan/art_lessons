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

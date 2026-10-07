# #728: холодный DOWN до первого draw (CPU only)

Source27ee2f12, синхронный Room baseline. Instrumentation/test only; production
исходники, флаги, drybrush/tip и userstand не меняются. No GPU run.

## Подтверждённый reachable путь

`_onStart` проверяет locked/paper/active layer, затем завершает прежний settle,
если он существует. Эта ветка независима от cold allocation и рассматривается
liveMorph отдельно. С нулевым previous settle создаётся RibbonStrokeScratch —
его constructor НЕ создаёт GL textures. После wash/checkpoint/tip setup вызывается
DabSystem.startStroke → `_paintStrokeDabs` → `_paintDabs` → `_paintRibbonDabs`.
Он лениво создаёт настоящую tile и scratch через getOrCreate / solventFilm.
После первого dabs batch `_onStart` прямо вызывает `_display`, который выполняет
`_flushLiveComposite` → `_composeToFBO` → `_composePaperToScreen`.

Actual engine + MockGL, page1754×2480/Fine, viewport640×480, point400,400,
pressure0.8, normal100:100 PB29 round, gradientFibres=true, async/material=false:
для brush100 И400 одинаково **8 RGBA8 textures1024² =32MiB** до display:

- canonical target tile:1;
- scratch original/coverage/inkLoad/inkColor:4;
- solventLoad/strokeSolvent/solventBase:3.

Дополнительно display workspace100 создаёт10² RGBA8(400 bytes), 400 создаёт34²
(4624bytes). То есть основная cold allocation определяется tile footprint, а не
brush area. У точки рядом с tile boundary число tiles может быть другим: этот
вывод относится только к одному реально затронутому tile в данной CPU fixture.

Внутри обоих DOWN: checkFramebufferStatus0, createProgram/compile/link0.
AccumulationBuffer проверяет framebuffer только ОДИН раз на context; в готовом
Room этот check уже произошёл на boot. Все RibbonPasses programs init на boot,
gradient typed warm также до ввода. Это исключает эти вызовы в указанном reachable
CPU case, но НЕ измеряет driver allocation stall и не доказывает device first-present.

## Диагностика

`docs/qa/harness/728-first-down/allocation.mjs`: обёртки существующих CPU/GL calls,
без добавленных getParameter/check/readPixels/finish/fence, без new resources.
Shadow framebuffer ведётся по наблюдаемым bindFramebuffer, начальное состояние
unknown (не придумывается). До cap2048 records; cap-hit incomplete. Return/throw,
receiver, аргументы и исходные ресурсы сохраняются, dispose восстанавливает методы.

События pool request, actual texture creation/storage logical bytes, scratch
getOrCreate/film/solvent, nib/bands/composite commands, first offscreen draw и first
screen draw записываются относительно actual `_onStart`; timestamp PointerData
сохраняется отдельно. NO assertion «draw=visible»: offscreen может быть V/coverage,
screen submission ещё не presentation/compositor. No JS span→GPUduration claim.

CPU controls PASS: return/throw/stop/cap/no-added-query/dispose. Actual-engine test
PASS (sizes100/400, exact8 storage calls,0 latecompile/check). Private raw
`temp/cpu/first-down-actual-calls.json`; rerun log `first-down-room-options.log`.
MockGL JS timing не используется как время реального устройства.

## Следующий аппаратный план (пока без grant)

Подключить passive installer ДО первого native pen DOWN в двух fresh own rooms
одного exactsource/paper/viewport;100/400, неподвижная точка вдали от tile boundary.
Проверить ready/paper/empty/no previous settle/default flags. До измерения не
создавать hidden scratch/stroke и не выполнять diagnostic readback. После onset
снять nonempty pigment crop отдельно и actual rAF/screen-present timeline из
profiler. Сравнивать allocation count/bytes и producer chronology, не суммировать
вложенные CPU durations. Повторный warm gesture отдельно после законного pen-up,
settle idle и exactsame preset: не вызывать второй start на незавершённом gesture.

Если задержка предшествует `_onStart`, allocation не объясняет её. Если createTexture
и texImage2D вызываются после первого visible frame — они также не объясняют onset.
Если JS быстро submitted, но экран задержан, потребуется browser/GPU/compositor
trace; этот passive probe сам GPU ожидание не измеряет.

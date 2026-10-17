# #744: hidden replay material-only candidate

Изолированная agents/744-hidden-replay, base717506a8. Эксперимент
`engine.diagnosticM70HiddenReplay` defaultFALSE. Не совмещён с отдельным
3basecopy/copyTexSubImage candidate или CPU undo cache. Runtime не запускался.

Hotspot исходногоundo100-cache:100малых ops всёравно100раз делают fullpage
controller.host.render(clear+composite), presentation.acceptInput, next→raw
и presentation→tile. Nativegoal guard сокращает лишние solver invocations,
но эти raw/display стадии остаются. FilmP/C/solvent normalization уже имеет
scissor, в отличие от полных film-base copies/clears. Просто ещё раз scissor
normalization не решит hotspot.

Canonical dependency proof по коду:

- NativeTarget.resetFromScratch читает original/P/C/coverage/solvents,
  finishmetadata, paints, compositeScalars/direction. Не layer.raw/next и
  не presentation. Клонирует источник перед solver.
- Controller.accept сначала привязывает tile/context, затем вычисляет только
  transientRGBA и display. Эти pixels не записываются в material arrays.
- eraseDryBase меняет только original через callback; epoch/dirty/goalReady
  меняются прежним образом. Hidden branch пропускает только transientrender.
- close/expiry/Dry/ordinarytool boundary по-прежнему запускают обычный solver
  и host.render(goal), затем фиксируют goal в targettile. Нет skip material.
- canonicalTiles для duplicate/merge всёравно finishgoal и возвращает goal,
  а structural replay читает через canonical callback до composite/teardown.
- CPU park сохраняет scratch fields/metadata, не presentation. При парковке
  canonicalTiles фиксирует display-anchor, sourcewater при этом остаётся.

Изменение: target-local reference-depth guard на время synchronous_replayInto
или lifetime slicedRebuildJob. Не globalфлаг, висящий через generator yield;
живой ввод в другой target не попадает в guard. Sync finally, jobcancel finally
и setupfailure снимают lease. Cancel не рисует частичный результат.

Hidden accept сохраняет context/tile/materialrevision/dirty и не рисует raw/
presentation. Complete всёравно рассчитывает canonicalgoal обычным solver,
но не запускает hidden animation. Перед показом target ровно один раз:
невычисленный goal→rawrender/reset+обычное scheduledgoal; готовый goal→reset
к нему, при сохранении wet scratch/timestamp. Последнее меняет только
декоративный restart после undo/load; model math и живой brush path не меняются.

Нельзя вместо этого blindscissor rawcomposite к bbox текущего dab: profile,
composite scalars и neighbor readreach могут изменить старые coveragepixels.
Нельзя объединять ops/менять MAX/additive order или rounding. ROI film-init
требует отдельной validity-region proof и здесь не реализован.

Unit A/B actual Engine+MockGL: записанные mixedprofile/colors, purewater,
poolbridge, Dry/UndoDry, pencil/clear boundaries; сравнение source buffers при
каждом NativeTargetreset и canonical output, уменьшение transientrendercalls.
Cancel suspendedgenerator и syncfailure проверяют снятие target guard.
MockGL не моделирует watercolor shader. Изъятые displaydraws также меняют GL
state, поэтому скрытые inheritedstate зависимости можно исключить только
реальным before/afterGPU; source-level proof не заменяет hardware.

До продвижения обязательны:

- На обоих настоящихGPU flagOFF/ON sameexactinput: исходныеP/C/coverage/
  solvent+конечныйgoal/PNG побитово равны, GLerrors0, mixedprofiles/boundaries.
- Оригинальный100×4moves1024→B Dry→A Undo далёкогоred, измерять swapMs и
  readyDisplay, а не только firstROI. Отдельно beforeUP новыйheldstroke.
- Cancel/restart/contextloss/thirdwet eviction, structural copy и rejoin.
- Source/CPU время без HMR/тяжёлойVPSнагрузки; никаких performanceclaims до run.

Новых служб/contexts/fixtures нет; сохранены isolatedWT и per-entry deps.

Oracle fullReplay/export тоже использует _replayInto: эталон надо запускать
при flagOFF либо в отдельном freshcontextOFF, чтобы не скрывать общий баг.

Проверки кандидата:46unit/5filesPASS (actualEngineA/B, controller/residency,
historical copy и structuralOps), webTYPECHECKPASS, scopedlintfixPASS;
indexlint только прежние no-this-alias/require-yield warnings, diffcheckPASS.

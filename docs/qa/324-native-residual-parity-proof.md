# #324: остаточная native/replay разница после canonical export

Read-only исследование от d38a9aa0, 2026-10-06. Engine/shader/source-pass не изменены, GPU не запускался. Исправление экспорта отделило мокрый presentation; остаются Vega463px/max10/mean.00036625 и parent Samsung525px/max12. Нельзя считать даже небольшой остаток доказанно допустимым: exact dry replay остаётся целью.

## Что исключено CPU oracle

Исторический source-ab-no-reveal/report.json содержит native/append finishContext для той же линии. radius16.587967959570904 против16.587968826293945; bounds отличаются примерно1e-6. Оба дают одинаковые S1, frontReach89, dryMargin24, pad201, rect[0,0,517,387], rimwidth3, inward5, outward105 unit passes (27 scheduler groups), carry14 и gather4. Composite integer rectangle[68,113,317,187] одинаков. Не найден переход ceil/round/half-resolution threshold в этой сохранённой паре. Это та же сцена, но не сохранённый finishContext точного743canonical-export запуска: его harness context не записывал.

Opacity после float32 округления совпадает. Radius после float32 округления тоже совпадает. Но производные f64 budget и rimShare различаются; одинаковый округлённый радиус ещё не означает одинаковые производные, когда они вычислены до округления. Float32 сравнение всех реальных shader uniform пока не записано.

463 разных пикселя реального canonical-export PNG лежат в bbox[104,140,278,160], внутри пигментного ядра, а не на внешнем крае field rect. Это не доказательство причины, только локализация. Исходные7ROI P/C/V/coverage/films были byte-exact, но они не содержат всю brushDrag metadata.

## Найденная недетерминированность контактов

CPU native pointer pipeline для15move линии (x100..280,y150,pressure.7,size40,water100,pigment15) и packed replay той же операции остановлены перед solver. MockGL здесь не моделирует физику: используется только настоящий расчёт dabs/brushTravel/brushDragContacts. Получены28 travel,23 contacts. Все contact rect и все RGBA contact field bytes совпадают, но радиусы f64 отличаются.

22 из23 GPU float32 contactGain отличаются на1ulp, при одинаковом числе substeps. Для первых19: native1.1058645248413086, replay1.1058646440505981, 3 substeps. contactGain=.2*radius/substeps. Вычисление substeps/gain после Math.fround(radius) даёт23/23 точных совпадения. Это конкретное нарушение равенства параметров solver, но пока не доказано, что оно создаёт463 пикселя/max10.

Проверка по реальным сохранённым данным: восстановленные из32dabsPacked743canonical-export операции28travel/23contacts **точно совпадают** с CPU replay fixture по rect/radius/contactRGBA. Таким образом CPU fixture воспроизводит геометрию и контактные поля данной реальной операции. Исходный actual native brushTravel не был сохранён, поэтому полная pair causal связь ещё не доказана.

## Следующий ограниченный эксперимент

AB с одинаковой записанной операцией, source7ROI и raw canonical target: только нормализация radiusPx перед производными settle и contact.radius перед substeps/gain, без изменения nib/source-pass/operation format. Проверить равенство фактически переданных float32 uniforms и уменьшение native/replay остатка. Не называть это универсальным parity fix: source dose/clock может тоже зависеть от pre-pack f64, а в одном старом noop AB исходные inkLoad/strokeInk ROI уже расходились.

Более полная стратегия — native painter должен получать тот же canonical dab representation, что будет записан/передан (текущий codec ужеfloat32). Однако менять stream до own raster стоит отдельной проверкой live-chunks/offsheet/pressure/clock, а не бессистемно округлять finishCtx. Реконструкция finalctx из packeddabs не исправляет уже разный material source.

## Артефакты и проверки

Own temp/parity: plan-proof.ts/json/log; cpu-probe.json и native-probe-test.ts (временный тест перемещён из app после запуска); cpu-contact-diff.json; contact-gains.json; contact-normalization-proof.json; actual-packed-contacts.ts и actual-packed-contact-check.json; diff-location.json. Реальный case — соседняя324-preview-isolation/temp/policy/source-ab-canonical/. Диагностический тест не объявляется GLSL/image regression.

Правильный `npm run typecheck --workspace @grafetto/web` на этой worktree PASS. Прежняя команда tsc -p apps/web/tsconfig.json у агента была references-only и не проверяла app; ранние заявления typecheck для99/743 надо читать вместе с исправлениями parent7fdcc459. Здесь source не менялся, inherited d38 содержит исправленные actual app types.

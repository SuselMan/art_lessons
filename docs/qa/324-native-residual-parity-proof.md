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

## Default-off uniform-only кандидат 463d1082

Новый флаг `RibbonStrokePainter.diagnosticCanonicalSettleRadius` по умолчанию false. Только solver metadata получает minorRadius из `Math.fround(dab.size)*.5*presetMultiplier`, majorRadius также использует float32 aspect. Исходный nib, bounds/flow RGBA и contact grouping используют прежние radius. Optional `BrushTravel.settleRadius` меняет исключительно contact gain/substeps. Формат операций и codec не меняются. Два meaningful CPU теста и8 прежних brushDrag tests проходят (10), правильный web workspace typecheck проходит.

Первый настоящий Vega capture дал28 travel/23contacts. Off:23 разных contact.radius и22 разных float32 gain; on:0 разных radius/gain. Но диагностический fixed-seed hook стоял только на `_paintDabs`, который native raster обходил: P/C source ROI native/replay различались. Эти4177/4167px PNG нельзя выдавать за причинный AB нормализации. V/coverage source совпали, GL0 в обеих парах. Исправленный общий seed hook на `RibbonStrokePainter.paint` подготовлен; вывод о GPU parity ждёт повторного source-exact oracle. Артефакты первого запуска сохраняются отдельно, не удалены.

## Причинный GPU oracle: controlled round native/replay

Исправленный harness использует общий `RibbonStrokePainter.paint` seed[0,0] в native и append, фиксированные pointer timestamps1000+i*16. Это диагностический контролируемый ввод, а не обещание всех обычных комнат. Настоящий PencilEngine, Vega Chrome, medium paper,15move, round40px/pressure.7, water100/pigment15; native normal finish[true] и packed append. Экспорт канонический, оба источника/ветки включают inherited V review flags.

Все7 source ROI **exact native↔append и off↔on**: coverage, inkLoad, inkColor, solventLoad, strokeInk, strokeColor, strokeSolvent. Off native/replay310px/max10/mean.00019615. On **0px/max0**. Append dry PNG off↔on **точный**, native меняется ровно310px/max10 и становится точным append. В каждой паре GL0. Actual ctx radius off16.587967959570904↔16.587968826293945; on оба16.587968826293945. Это ограниченное причинное доказательство: исключительно radius metadata устраняет остаток в данной source-exact сцене, без изменения исходного материала или replay результата. Не универсальный parity fix и не разрешение включить флаг во всех режимах без других cases.

Артефакты `temp/parity/canonical-radius-{off,on}-matched/{report.json,native.png,after.png}`, harness `canonical-radius-{off,on}.mjs`, summary `radius-ab-matched-summary.json`. Исходные полный raw ROI buffers сохранены на home в тех же папках, компактные metadata/PNG скопированы VPS. Первый confounded запуск остаётся в отдельных папках без `-matched`.

## Второй bounded native case: chisel

Chisel57px/pressure.43,15move(x100+i*12,y150+i*2), те же controlled seed/timestamps, water100/pigment15. Все7 source ROI exact native↔append и off↔on. В off и on canonical native/replay PNG точные0px/max0; native и append off↔on также неизменны. GL0,53brushTravel на обеих ветках. Off ctx radius28.5↔28.500000810388883; on оба28.500000810388883. Этот case проверяет отсутствие регрессии другого наконечника/нажима, а не доказывает дополнительное исправление (baseline уже был exact). Артефакты `canonical-radius-chisel-{off,on}-matched`, `summary-chisel.mjs`, home `radius-ab-chisel-matched-summary.json`.

Итого предлагается принять нормализацию solver radius **только для V review** после parent review; source commit всё ещё default-off, никакой публикации не было. Полный native/foreign-water multi-stroke parity требует отдельной проверки: source dose, записанная wetness и flow raster здесь не округляются.

## Root integration

Исходники463d1082 перенесены в324-watercolor-transition после foreignV c206. Canonical radius включён только в существующем DEV VITE_WC_REVIEW entry; production defaults сохранены. Root actual workspace typecheck PASS до единственной boolean строки entry,9 targeted CPU tests PASS; канонический экспорт и reveal retirement проверены отдельно после объединения.

## Root combined Samsung proof (c1997fee / 5301)

SM-T970, отдельная create?qa=root-combined-20261006 вкладка. Обычный native round40px pressure.7,100 воды/15 пигмента,15 move, затем Dry, канонический экспорт, undo/redo и rebuild. Автоматические DEV combined/V/bottomless/foreign/canonicalRadius flags проверены без изменения через console. Все фазовые getError0; contextLostfalse;26 уникально salted cold shader links,0 failed. Sharp raw PNG oracle2000×1200: native vs rebuild **0 разных пикселей/max0/mean0**; redo vs rebuild byte-exact. В прежнем root single-line canonical export контроль был525px/max12. Этот новый реальный контроль подтверждает parity данного native мазка на Samsung; не универсальное доказательство всех rooms/chunks.

Артефакты root temp/wc-runs/own-water/native-combined-samsung.json, native-combined-samsung-metrics.json, native-combined-before-samsung.png и solvent-combined-native-samsung.png. Собственная QA вкладка закрыта, forward9233 удалён, пользовательские вкладки не менялись.

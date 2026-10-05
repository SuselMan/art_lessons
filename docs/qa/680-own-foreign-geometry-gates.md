# #680: geometry/contact gates после разделения own/foreign V

Read-only CPU исследование от root0c517b10, 2026-10-06, worktree680-fluid-geometry. Engine/shader/default source не менялись, GPU/устройства не запускались,5301 user-facing frozen не тронут. P delivery/budget исследует другой агент; эта запись рассматривает только metadata/geometry при условно одинаковых физических P/V и available fluid1.

## Главный отдельный gate: brush contacts

RibbonStrokePainter записывает brushTravel только при `profile.normalizeDeposit && length>0.01 && profile.waterLevel>0`; `water` события также равен nominal profile.waterLevel. При dry0/pigment100 поверх чужой воды CPU `availableHere=1`, но **ни одного brushTravel**, следовательно WatercolorSettlePlan не выполняет brushDragContacts/chronological optical-depth-and-pigment exchange. Own wet100/pig100 при той же доступной жидкости выполняет их. Это различие существует отдельно от найденного main5× pigment travel budget.

Ограниченный oracle запускает настоящий RibbonStrokePainter.paint, реальные profiles/presets/dabWorldHalfExtents/RibbonStrokeScratch и brushDragContacts. Context.resolveWithinSheet фиксирует запрашиваемые reach rect и возвращает пустой список: ни buffer allocation, ни GPU raster. Остальная до-raster metadata/depletion логика выполняется настоящим production кодом.20rounddabs size120/r60, x400..628/y500,12pxtravel/16ms, combined bottomless shared-fluid:

| Ввод | availableHere | brushTravel | реальные contacts | recorded wetContacts |
|---|---:|---:|---:|---:|
| Own wet100/pig100, recordedwet0 |1|19|7|0|
| Foreign dry0/pig100, recordedwet1 |1|0|0|20|
| Same wet100/pig100, recordedwet1 |1|19|7|20|

Последняя строка отделяет nominal-water contact gate от recorded-wet tag: сам wet tag не выключает brush flow, это делает profile.waterLevel0. P/V fields не были нарисованы, поэтому этот CPU oracle не утверждает source-exact GPU/result equality. Он причинно доказывает разные списки solver contact operators при одинаковом scalar available fluid.

## Один изолированный следующий флаг

`diagnosticFluidBrushContacts=false`: исключительно в brushTravel metadata выбирать `contactWet=availableHere` вместо nominal profile.waterLevel, gatecontactWet>0; сохранить geometry/dx/dy/radius, chronological grouping/canonical settleRadius. Не менять pigmentByDab, waterByDab/V delivery, wetProfile, wetContacts, old halo bounds, renderer mode, shader или op format одновременно. При availableHere1 это восстановит19travel/7contacts dryforeign и даст тот же контактный clock, что у wetdirect; при drypaper/nominalwater0/availableHere0 контактов по-прежнему нет.

Важно: это контактный exposure clock, **не объём V**. Превращать его в constant-water stencil запрещено. BrushPass сейчас привязывает `u_water=field.coverage.texture` и читает `.a`, не отдельный physical solvent V. Поэтому нельзя просто записывать water1 для любого drybrush независимо от available fluid: coverage.a существует и на сухой краске, такой shortcut двигал бы dry paint. Нельзя также объявлять CPU availableHere точным V-volume: это scalar metadata из priorwet+ownstanding. В первом GPU AB следует удержать source P/C/V/coverage и geometry exact, переключать только contact flag перед targeted pigment stroke, проверить masses/core/halo/GL/native-rebuild. В mixed wet/dry случае физическая V-gating brushPass потребует отдельной оценки, не входит в этот один-флаг oracle.

## Halo: appearance отключён, legacy bound ещё активен

watercolorHalo имеет SHED0, WATERCOLOR_HALO_DRAWN=false. Следовательно grown halo не рисуется и `inkEdgeFalloff:1` его неиспользуемого profile не меняет P/C; нельзя выдавать bound tweak за новый halo appearance fix.

Но haloBound(d)=watercolorHalo(recordedwet,1).scale всё ещё1→1.9, haloPast=3*WATERCOLOR_SPREAD.cap (cap3px, значитpast9px) при recordedwet>0. Это меняет reachRect/targets и reachBounds, переданные noteFinish, хотя paint/composite bounds при HALO_DRAWN=false остаются nib-only. Oracle r60:

- recordedwet0 reachunion[340,440,688,560];
- recordedwet1 reachunion[277,377,751,623].

Отдельный same-brush geometry oracle показывает возможный дискретный эффект.20dabs r60/x1000+i*13/y1000, одинаковые brush water1/effectiveWet1. Реальные reach rect; production scalar/compositePad23 и settle padding251. При одинаковом resident tile union[0,0,2048,2048], где clipping не включается, full window width915 (recordedwet0) против1041 (recordedwet1): `WC_HALF_RES_RADIUS_PX48`, spanthreshold1024 переключает S1→S2. Это CPU threshold proof, **не доказательство**, что он портит конкретную user spiral. Shrink bound без учёта настоящей чужой V-domain может обрезать резервуар; не предлагать его общим исправлением внешнего вида. Если делать отдельную bound-абляцию позже, сначала frozen P/V + exact windows/resolution, а не одновременно с contact/P delivery.

## Falloff / prewet labels

Профиль создаётся настоящим engine из recorded landing wetness. Direct water1/wet0 и dry0/wet1 получают одинаковые transport water effects: inkEdgeFalloff0, cappedspread, cloud/edgeSoft/tide effects; migrate0. Brush dryContact зависит от собственного nominal water, но composite dryness умножается на отсутствие доступной waterHere/standingHere; в fully flooded area это0. Halo construction после availableHere использует paperWetByDab, который shared-fluid уже обновил after own delivery; source SHED0 оставляет его без визуального эффекта.

`wetContacts` остаются recorded-wet>=.3 намеренно: это выбор предыдущих reservoir gestures для foreign import. Нельзя бездумно заменить этот gate availableHere и заставить ownfreshwater выбирать unrelated previous dry/dried sources. Смешение metadata wet tag с volume — другая проблема, не причина отменять журнал/dry epoch invariants.

## Артефакты

`temp/geometry/production-metadata.json`, `probe.log`, `production-metadata-probe.test.ts`. Последний — временный diagnostic test, перемещён из app после успешного запуска: для повторения скопировать обратно в src/engine/src/dabs/geometryProbe.test.ts и запустить `npx vitest run src/engine/src/dabs/geometryProbe.test.ts` из apps/web. Один CPU diagnostic passed; это не GLSL/render test. Исходники приложения не изменены, публикации нет.

## Изолированные кандидаты и первый GPU контроль

A `diagnosticFluidBrushContacts` и B `diagnosticRetiredHaloBounds` реализованы отдельными default-off флагами. Три CPU теста настоящего RibbonStrokePainter проверяют metadata и неизменность dry/dry control; `npm run typecheck --workspace @grafetto/web` проходит. B пока проверен только CPU.

Первый A off/on рендер на Vega5302: own wet100/pig100 и dry/dry дают точные одинаковые canonical PNG; контактный список соответственно23/23 и0/0. Clearwater→drypigment даёт0→23контакта,3678изменённых пикселей/max24. Во всех трёх парах семь source ROI P/C/V/coverage полей перед settle побайтно одинаковы, GL0/context intact. ROI256×128 покрывает этот короткий штрих, не весь многотайловый холст. Source V alpha sum у own и clearwater→drypigment369480; P между разными сценариями различается из-за отдельного nominal-water pigment budget, который исследует основной агент. Off/on внутри сценария P совпадает.

Этот clearwater→drypigment контроль оказался **в одной wash**: изменение preset/цвета не разорвало native grouping. Поэтому он доказывает contact-only effect при сохранённой своей V, но не проверяет импорт чужой V. Попытка true-foreign с одной сменой цвета завершилась assertion `Not foreign wash`; Chrome закрыт, результат не используется. Для следующего контроля подготовлена штатная граница tool pencil→watercolor без мазка и сушки: `_clearWash` завершает scratch, но сохраняет wet paper. Новый harness дополнительно требует разных washId и foreignSolventLoad. Его успешный результат ещё не получен.

Визуальный первый кандидат даёт небольшое перераспределение на концах/внутри prewater штриха; это не полное own/foreign равенство и не утверждение пользовательского улучшения. Артефакты: `temp/geometry/contact-ab/summary.json`, `contact-compare.png`, исходные off/on PNG и bounded source SHA; отдельный `contact-foreign-ab-run.log` сохраняет неудачную assertion попытку.

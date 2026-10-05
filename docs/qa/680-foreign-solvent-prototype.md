# #680: чужая доступная вода и отдельный borrowed V — диагностический прототип

Принцип: повторно исполнить **тот же водный источник** из Operation Log без нанесения пигмента, объединить доступность контакта через MAX, хранить заимствованный растворитель отдельно от собственной материальной записи. Прототип выключен по умолчанию (`diagnosticForeignSolvent=false`), новых полей операций нет. Для отдельного native review нужны одновременно DEV, VITE_WC_REVIEW=1 и VITE_WC_FOREIGN_REVIEW=1; private .env.local только5298, без product UI или изменения общего стенда. Основание 0d746396, отдельная рабочая копия680-foreign-solvent;5296/5297 и пользовательский5290 не изменялись.

## Граница и исполнение

`WaterSource` удерживает исходные chunks с ID, preset, color, dabs, wet и seed. Источники выбираются прежним отбором done/log order/layer/wash/возраст WET_DRY_MS, с барьерами paper_dry/layer_clear. Только записанный положительный wet-контакт открывает источник. Контакт пока открывает весь gesture, не отдельную связную компоненту. Это свежий static-source эксперимент, не испарение и не консервативное разделение воды между пользователями.

Auxiliary painter исполняет original source profile и nib/band geometry с теми же clocks, seed и policy. Его water-only guard запрещает material deposition, composite, diffusion, finish, отметку слоя, изменение PaperWetness и публикацию операций. Нет рекурсивного импорта. Независимые depth и MAX blending обязательны: наследование diagnosticDepth от получателя превращало per-segment source в whole-batch, а выбор MAX через отсутствующий material film превращал водный film в ADD. Оба исключены; cancellation возвращает guards в try/finally.

После полного исполнения auxiliary scratch получатель получает MAX coverage и отдельный `foreignSolventLoad`. Gesture импортируется однократно, chunks дедуплицированы по ID; импорт повторяет существующие newFilm/releaseFilm границы каждого encoded chunk (MAX внутри film, ADD к base между chunks), а не меняет реальное accounting доноров; собственный `solventLoad` не увеличивается. Перед settle временное поле собирается из ownV + borrowedV с существующим cap4. V/4 RGBA8 использует r/a; пигмент и оптическая глубина остаются в прежних единицах. Checked-out auxiliary scratches явно принадлежат painter: destroy очищает их до pool.destroy, context loss забывает refs без GL-вызовов; generator finally удаляет владельца при завершении/отмене. Auxiliary scratch уничтожается, borrowed буферы принадлежат получателю и участвуют в destroy, snapshot, spill, restore и unspill.

Дополнительная память: borrowed V4MiB на1024²tile; auxiliary scratch до20MiB/tile (original,coverage,V film/base/load), временная merge поверхность4MiB/tile. Шейдеры и количество samplers не изменяются. Донор не debited; несколько получателей могут заимствовать один источник. Поэтому это не global water mass conservation и не обратное смешение двух цветов. Source pickup/refill и исторические finish landedWet/wetPeak остаются отдельной нерешённой границей.

## Отозванная ошибочная проверка

Ранние synthetic dry-on-existing-water/dry-on-foreign-water fixtures присваивали воде и цветному проходу один strokeId `same-pigment`. При own wash это наследовало clocks одного gesture, при foreign wash прежний selector останавливался на водном проходе как на текущем. Их большая визуальная разница и результаты no-op OFF/ON **не являются доказательствами происхождения воды**. Исправлены обе пары: strokeId каждого жеста равен собственному ID, washId сохраняется. Настоящие операции комнаты не переписаны; Samsung root fixtures уже имели разные gesture IDs.

Гипотеза отсутствующего operation context оказалась неверной: после исправления fixtures существующий selector работает. Дополнительное прокидывание context полностью удалено из кандидата.

## Доказательства

Артефакты находятся в `temp/foreign/` этой копии и домашней копии5298. `cases.json` содержит четыре corrected controls: samewash OFF/ON и differentwash OFF/ON, чистая вода normal:100:0 затем сухой пигмент normal:0:100, одинаковые dabs и отдельные gesture IDs.

GPU source proof `gpu-depth/report.json`: original donor V и borrowed V **byte-exact SHA256**, r/a суммы369294 codes, g/b0. Исправленный источник не добавляет pigment/depth. Samewash OFF/ON все source P/C/V/coverage byte-exact. Foreign OFF/ON P/C/depth byte-exact, собственный V0 сохранён; меняется только coverage availability и borrowed V.

GPU `state.json`: patterned borrowed V snapshot/restore и spill/unspill byte-exact; imported gesture metadata сохраняется; own V и следующий film base byte-exact. GL0, contextLostfalse.13 targeted tests PASS (включая destroy engine во время suspended auxiliary source); web app typecheck PASS. Финальный `gpu-final/report.json`:4controls GL0/lostfalse; все own source поля OFF/ON byte-exact, foreign sourceP/C/ownV byte-exact, donor/borrowedV byte-exact. `rebuild-final/report.json`: все4PNG load/rebuild byte-exact, GL0/lostfalse. map:check PASS; штатный `npm run lint -w apps/web` PASS (6 прежних предупреждений вне кандидата).

Визуально corrected сухой пигмент по воде в обоих wash остаётся плотным со щелями; прежняя огромная разница была ошибкой fixtures. Импорт устраняет структурную нехватку V, но этот контроль не доказывает решение всех пользовательских претензий и не готовит самостоятельное приглашение на смотрины.


## Дополнительные chunks и native entry

`chunk-bounded/report.json`: реальный источник разделён на2encoded chunks с одним water gesture и разными op IDs. Оба OFF/ON GL0/lostfalse; recipientP/C/depth и ownV byte-exact. BorrowedV byte-exact равен исходному donorV после второго chunk, r/a405626 codes, g/b0. `chunk-rebuild-bounded/report.json`: оба PNG load/rebuild byte-exact. Здесь точно сохранены реальные film boundaries, не объявлено исправление ADD между chunks.

Попытка прежнего harness с fulltile base64 для каждого поля3операций завершилась Targetcrash; renderer имел большой строковый payload приavailableRAM≈1GiB. Это не доказательство GL регрессии. После удаления fulltile payload SHA256 считается `crypto.subtle` внутри страницы, наружу возвращаются только stats/hash/PNG; fresh engine probe и bounded повтор GL0/contextLostfalse, flags.foreigntrue. Пользовательские Chrome/cache/вкладки не трогались.

`native.mjs` не устанавливает diagnostic flags вручную. Автоматический DEV entry проверен: combined/record/sharedFluid/solvent/landingfluid/bottomless/foreigntrue. Источник — remote чистая вода от другого user со своим strokeId/washId и fresh timestamp; цветной штрих идёт настоящими `_onStart/_onMove/_onEnd`.

Native1: remote чужая вода→сухой pen pigment;2operations, undo/redo/rebuild, всеphaseGL0/faults[], contextLostfalse, все RGBA PNG byte-exact. Native4:5operations с дополнительными own-water+15%pigment и dry contact; всеphaseGL0/faults[], contextLostfalse. Undo/redo и rebuild согласованы друг с другом, но native до rebuild отличается517pixels,max11 codes,bbox[100,340,285,541]. Это небольшой оставшийся native/replay drift, не объявлен исправленным этим water-source прототипом; отдельный morph агент проверяет float-profile boundary. Основание включает canonical exportSOURCE743adafd и typefix7fdcc459.

## Samsung native smoke (root, c2064b58 / 5298)

SM-T970, отдельная create?qa=root-foreign-20261006 вкладка; автоматический DEV entry combined/V/bottomless/foreign, без ручного изменения flags. Remote clear-water operation другого user/gesture/wash, затем настоящий native сухой pigment stroke. Все11 фаз ready/water/stroke/dry/export/undo/redo/rebuild GL0, contextLostfalse.26 программ реально скомпилированы с уникальным shader salt,0 failed. Native, redo и rebuild канонические PNG byte-exact. Две операции, свежий маленький контроль; это не доказательство качества всех комнат/обратного смешения двух цветов.

Артефакты root temp/wc-runs/own-water/native-foreign-samsung.json и native-foreign-{before,redo}-samsung.png. Только собственная QA вкладка закрыта, forward9233 удалён; пользовательские вкладки сохранены.

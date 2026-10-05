# Принятая c1997fee: аудит включения production

Read-only аудит 06.10.2026. User-facing5301/галерея и исходники принятой версии не изменены. Root HEAD на момент аудита c60a50fd; анализируется именно accepted c1997fee, origin/main6007b92e по свежей сверке parent.

## Почему обычного merge недостаточно

`RibbonStrokePainter` constructor включает accepted tuple только при `import.meta.env.DEV && VITE_WC_REVIEW==='1'`, foreign дополнительно требует VITE_WC_FOREIGN_REVIEW. Production Vite build подставляет DEV=false, поэтому даже установка этих env в deploy workflow не активирует модель. Отдельный второй guard в paint: `const segmentMode = import.meta.env.DEV && profile.normalizeDeposit ? this.diagnosticSegmentDelivery : false`. Он выключает модель даже после смены field defaults.

В c199 production получит legacy/dry без independent V, foreign V и canonical settle radius, тогда как пользователь одобрил combined/bottomless/fluid с independent/foreign V. Уже true поля pigmentRecord/sharedFluid/landingReservoir сами по себе ничего не гарантируют, пока segmentMode false.

## Минимальный production diff

Изменить только `apps/web/src/engine/src/dabs/RibbonStrokePainter.ts`:

1. Defaults: SegmentDelivery='combined'; PigmentRecord=true; SharedFluid=true; LandingReservoir=true; SolventField=true; CanonicalSettleRadius=true; LandingPolicy='fluid'; WaterPolicy='bottomless'; ForeignSolvent=true. Это точно tuple принятого5301c199, не новый выбор модели.
2. `segmentMode = profile.normalizeDeposit ? this.diagnosticSegmentDelivery : false` — убрать только DEV gate; остальные tools остаются вне normalizeDeposit.
3. Удалить constructor DEV env activation, которая иначе могла бы на dev выключить foreign при отсутствии отдельного env. Либо оставить только явно отдельный debug override, не меняющий production tuple; самое малое предсказуемое изменение — удалить этот redundant block.
4. Удалить misleading "dev-only/default-off" comments у уже принятой tuple. Имена diagnostic можно пока сохранить, не делать одновременно большой rename/refactor.

Не трогать op format/serialization, P-delivery hazard/nominal-water эксперимент, Acontact/Bhalo/Rstyle/conductivity. Не переносить последнее root HEAD целиком, если accepted scope фиксирован c199: последующие source experiments остаются отдельно.

## Морф и export уже включены

c199 `_finishRibbonStroke` копирует реальную coverage в wetMask и ставит progressive/motion timestamps без DEV/env gate. `_revealMotionGain` onset250ms и duration8000ms; reveal shader применяется обычным display path. Dry request ускоряет presentation до2sec после готовности canonical solver, не обещает2sec wall-clock если solver ещё работает. Это bounded presentation flow, не физический solver.

Lifecycle b37 и canonical exporter includeWashReveal=false тоже без DEV gate. Обычная картинка остаётся с reveal; экспорт canonical не ждёт/отменяет animation. Production pipeline build npm run build --workspace=apps/web; deploy.yml не устанавливает WC review env, но после source-default activation это и не требуется. Нового shader program для activation не добавляется.

## Качество и ограничения перед публикацией

- Нужен **настоящий production bundle** smoke с автоматической tuple без console/URL/env override: обычный Room watercolor stroke, early Dry, undo/redo, reload/replay и GL0. DEV stand tests не доказывают снятие второго guard.
- CPU tests, которые рассчитывали legacy по умолчанию, должны выбирать legacy явно; accepted default test должен проверять tuple и normalizeDeposit gate. Не переписывать golden expected под неизвестный результат только ради PASS.
- Combined режим разворачивает batch по одной dab, новые V films/base и ephemeral foreign scratch увеличивают draws/RAM. Малые Samsung cold26links/GL0 и native parity уже сильны, но heavy actual scenes/многотайловый memory/performance ещё отдельный QA.
- Старые комнаты перерисуются новой моделью при replay/rebuild; version gating пользователь ранее исключил до первого релиза. Серверный формат тот же, но старый клиент до reload может показывать прежний renderer — проверять участников одной сборки.
- Canonical single-stroke100/15round Samsung exact, redo/rebuild exact. Сложный native4 имел6px/max6 residual, первые source fields не были exact: не заявлять универсальную bit-exact native/replay гарантию.
- Bottomless — accepted brush water policy, не отмена V cap4. Foreign source replay сохраняет MAXwithin/ADDbetween и dry/undo exclusions; полного symmetric двухцветного backmix не заявлять.
- Остаются user visual задачи: ring/spiral/неполное own-vs-foreign равенство. Accepted advancement не означает решение всех четырёх.

Принцип: публикация должна включать тот же accepted source/solver, который человек видел на5301; display morph остаётся presentation-only, canonical export/ops неизменны.

## Release-проверка менеджера 06.10

Отдельный worktree `680-watercolor-release` основан на принятом c1997fee и
содержит merge origin/main6007b92e (только новые assets логотипа).
Перенос меняет defaults и снимает DEV gate painter; DEV trace остаётся
только в development. A/B, hazard dose, Rpatch и новые diffusion solver сюда
не входят. Все девять настроек принятого review подтверждены отдельно
собранным Vite SSR production module, без window/DEV/environment override.

Изолированный npm ci + build shared/server Prisma устранили ошибки первого
setup с чужим старым shared/dist. Полный `npm run typecheck` PASS,
`npm run build` PASS (обычная production-сборка, paper bake и SW106entries),
map:check PASS67modules/937files, map:rules0errors/4knownwarnings.
После обновления обоснованных CPU fixtures весь engine suite:
**124files / 1418tests PASS**, maxWorkers2/testTimeout15000 (107.88s).
Это CPU correctness, не доказательство плавности или crossGPU parity.
Lint:fix0errors/7warnings. Артефакты `temp-{build,typecheck,engine-tests-final,lint-final}.log`,
`temp/release/production-model.{mjs,json}`.

Production Samsung UI первая попытка была INVALID из-за возврата DOM
объекта в CDP returnByValue (Object reference chain too long). Исправленный
повтор не нашёл собственную1132tab: она уже закрыта вне harness. Никакого
вывода о GL/пикселях этой обычной сборки пока нет. Forward9233 снят,
пользовательская1121settings/5301room не тронута; дальнейшая UI QA будет
в отдельной управляемой странице. Принятый c199 на Samsung ранее имеет
26saltedlinks/0fails, GL0, native single-round/rebuild PNG exact, но это
явно dev-review entry, не результат production UI попытки выше.

# Read-only аудит материала раннего preview

Проверен QA-код в `728-solvent-init`; движок и аппаратные прогоны не менялись. Это проверка контракта, не оценка картинки и не доказательство сохранения массы на GPU.

## Конкретный риск

`SealedPreviewGlPort.mjs:14–15` сначала уменьшает production coverage, затем заменяет её картой `(0,0,0,support)` из raw V.R/A. `OwnedPreviewRuntime.mjs:16` передаёт **эту же** карту в production composite. Транспортная маска и material coverage имеют разные значения каналов.

Production `shaders.ts:1648` читает coverage.B как standing water; `:1816` читает coverage.R/A как положение поперёк щетины. Замена стирает оба значения. PaperWet не обязательно становится нулём: он равен max(P.R/P.A, coverage.B). Но у краски с малой собственной водой над чужой водой wetness теряется. CPU fixture: coverage.B=230/255 и P.R/P.A=13/255 дают wetness 0.902 до замены и 0.051 после неё; across меняется с примерно0 на−1. Источник при этом остаётся неизменным.

Минимальный следующий paired gate: один и тот же P/C/original/recipe, сравнить composite с уменьшенной исходной coverage и с transport-domain coverage. Проверить low-own-water/high-standing-water и равномерный цвет. Если различие подтверждено, разделить транспортную маску и material coverage в собственных ресурсах preview; не записывать придуманную толщину в V.R/A.

## Проверенные свойства и ограничения

- P/C вычисляются из одной OLD стороны, с одинаковыми domain/paper/scale/radius; front переключается парой. Раздельного последовательного чтения нового P до C нет.
- Destination resolution1024 задаёт нормализованные tileUV, поэтому sampling128 покрывает тот же tile. Это правильно только в заявленном origin0/bounded1024 контуре; nearest-filter может давать восьмипиксельные ступени.
- Перед каждым composite pending восстанавливается из retained original, используется replace-draw. Повторное композитирование не накапливает opacity само по себе. Аппаратная видимость при detach/rebase/handoff этим не доказана.
- Общий линейный оператор сохраняет пропорциональный спектр в вещественной арифметике. Отдельные RGBA8 округления могут менять слабые отношения P/C и суммарные каналы; тест показывает простой отрицательный пример. Нельзя заявлять сохранение массы после произвольного количества preview ticks без actual total-channel readback.
- На неровной бумаге равномерная плотность не является неподвижным состоянием downhill transfer. Проверять надо постоянное отношение цвета, а неподвижность плотности — отдельно на плоской бумаге.
- Один diffusion tick на rAF делает скорость preview зависимой от частоты кадров. Канонический endpoint остаётся другим владельцем; это не deterministic replay модели.
- `complete(ticket)` возвращает false для stale ticket, но runtime не проверяет результат перед material(). Нормальный синхронный GL-вызов не даёт межкадрового вмешательства; это защитный риск при reentrant cancel/loss, а не доказанная аппаратная причина.

## Воспроизведение

`node docs/qa/harness/728-room-moment/preview-material-contract-audit.mjs`

PASS: реальные initialize/step из QA port; неизменность source; отрицательный material-channel пример; совпадение P/C аргументов; normalized UV; retained-original binding. Fixture использует явный абсолютный путь к read-only GPU worktree, чтобы не копировать runtime и не выдавать mock за GL.

## Повторная проверка bac0af65 и handoff

`bac0af65` передаёт **readonly owner.lease.fields.coverage1024** в composite, сохраняя отдельную domain128 только для diffusion. Normalized tileUV корректно читает исходные Q8 coverage/across/standing без повторного уменьшения. Это тот же физический объект текущего owner; epoch проверяется runtime перед tick, перед source rebase preview retire/detach выполняется синхронно, поэтому старый transport не читает обновлённые поля после rebase. Не распространять вывод на origin≠0 или изменение recipe без нового seal.

Fixture material теперь отдельно проверяет frozen6aeec405 неправильный binding и текущий исправленный binding; старый отрицательный пример остаётся reproducer дефекта, не ожиданием current regression.

Конкретная цепочка installer: завершение parent job → preview.beforeRebase(next) → retire/detach **pending** → morph.hold(next) → source.rebaseFromPredecessor → morph.rebaseStarted(next). Detach не удаляет `held.before`. Именно `held.before` показывает исправленный async-preview; pending — вычисленная цель, до которой reveal ещё может не дойти. Поэтому копировать pending вместо before означало бы дополнительный скачок. RebaseStarted меняет только время/длительность, before сохраняется; последующие `_advanceWashReveal` смешивают before к новой presentation. При finish transfer `morph.visibleField(owner).copyTo(canonicalHeld.before)` также берёт последнюю видимую картинку.

`preview-handoff-readonly-audit.mjs` использует реальный morph class: видимое37 сохраняется через detach/rebase при pending91 и новой source120. Отрицательный control прямой source даёт jump37→120. **Блокирующего CPU handoff-дефекта в этой цепочке не найдено.** Реальный тайминг advance, передача родительского delta и видимость первого GPU кадра остаются quality gates, а не доказанными дефектами. Runtime/source не менялись.

## Ограниченные history/layer/loss пути

`preview-history-path-audit.mjs`: три отдельные сцены на actual `_sweepReveals` и текущем preview runtime, PASS. Node-порядок не является actual Room pixel/history gate.

1. **Stroke→Undo/rebuild**: local operation_undo/redo/revoke при pending canonical вызывает `_cancelSettle` (`index.ts:2789`), canonical.cancel вызывает installer cancelOwner→preview.retire, pending отцепляется. Синхронный `_replayInto` дополнительно sweep live-layer before clear (`:4723`); deferred rebuild sweep before old.destroy (`:4689`). Actual sweep+guard освобождает held.before в engine reveal pool, но pending удерживает отдельный preview lease до fence. После Undo первый новый source не должен получить pending как canonical input.
2. **Stroke→layer_delete/merge**: `_destroyBuffer` sweep (`:5718`) раньше buffer.destroy. Guard вызывает retirePending; callback canonical cancellation повторно retire безопасен. Fixture доказывает: pending не попадает в engine pool, lease остаётся active до dispose/fence, ресурсы освобождаются один раз.
3. **Stroke→context loss→dispose**: runtime loss detach/retire всех states и stop rAF, без последующих step. Dispose при lost не вызывает gl.finish, освобождает retained leases и21 собственный ресурс. После восстановленного контекста нельзя повторно использовать старый runtime: новый setup/pool/source generation обязателен. Аппаратное восстановление в этом audit не проверено.

**DryAll** (`:7681–7690`) не является cancel: закрывает wash, сокращает duration до2000, при expedited ставит dryRequested, очищает PaperWetness. Пока held.startedAt=null pending остаётся целью; advance переносит pending→held.before. Поэтому DryAll не обязан освобождать preview lease немедленно. Следующий canonical land снимает pending, текущий visible before сохраняется для handoff. Математическая скорость transport остаётся один tick/rAF, а не ограниченная двумя секундами: actual DryAll-to-final timing нужен отдельно.

**Явное ограничение max3**: retire не возвращает физическую preview lease в очередь новых admission до session dispose. Undo/Redo/layer_delete не сбрасывают previewAdmissions. Tape water stroke→pigment stroke→third stroke→Undo→fourth stroke упрётся в capacity несмотря на освобождённую логическую картинку. Это заявленный bounded-session контур, не готовая непрерывная UX; не приглашать пользователя к неограниченному рисованию с этим флагом. Проверку следует ограничить≤3 author admissions; replay history не считать новым разрешением переполнить owner pool.

Восемь source inputs не пишутся этими paths: preview outputs отдельные, guard обращается только к pending identity. Fixture не утверждает нулевых canonical writes со стороны самого rebuild/solver — они ожидаемы и принадлежат другому владельцу.

## Конкретный кандидат снятия session-cap без fence на DOWN

Не использовать owner.land как сертификат GPU idle: land вызывается внутри generator до выхода `_advanceAsyncCanonical`, а финальные preview composite/presentation могли быть отправлены позже предыдущего fence. Удаление pending — логическое снятие ссылки, не GPU completion.

Без нового finish на DOWN можно переиспользовать уже существующие точки синхронизации:

- `index.ts:8344–8357`: `_advanceAsyncCanonical` вызывает `_syncContinuationGpu()` **после work.next**, включая done/land. При default путь `:4628` вызывает gl.finish; при completion-clock — GpuBudgetFence.sync. Сертификат допустим только после успешного возврата, live context/current request.
- `WatercolorSettleQueue.ts:237–248`: syncGpu после каждого batched pulse; аналогично сертификат только после возврата. `ctx.syncGpu` (`index.ts:1898`) — gl.finish.
- cancellation installer: после retire/cancel и existing gl.finish в microtask. Эта точка допустима только вне input/DOWN; не добавлять cancellation ради освобождения cap.

Предлагаемый узкий контракт `preview.noteCompletedBoundary(contextGeneration,submittedSerial)` вызывается синхронно сразу после **существующей** доказанной синхронизации. lastReferenceSerial обновляется после каждой preview initialize/step/composite и чтения pending при reveal/presentation, прежде чем команда может встретить следующую boundary. retire сначала detach pending/удаляет tick state; дальше releaseAfterFence только если lastReferenceSerial≤completedSerial и generation совпадает. Синхронизация не разрешает освобождать ещё attached state. Между certificate и release не await/rAF; новые submit получают новый serial. Потеря контекста закрывает старое поколение, старые lease не идут в новый context pool.

Existing pool уже поддерживает idempotent lease.release→available; transport releaseAfterFence проверяет token/epoch. Нужен drain retired (удалять released entries), а не dispose всего pool. Installer previewAdmissions должен стать количеством **активных/retired-not-completed** slots, а не lifetime-total; DOWN только pool.take/strict backpressure. Без certificate четвёртый admission отклоняется. Если canonical заблокирован и все3 slot retired, capacity может временно сохраняться: это честный bounded backpressure, не повод вставлять finish на DOWN.

Node `preview-idle-reuse-audit.mjs` PASS на actual pool/transport: cap4 отклоняется до idle; land/retire не достаточно; partial certificate освобождает только2 из3; четвёртый lease не alias pending третьего; поздние команды не покрываются старым certificate; повторный drain не удваивает release. Это **план и CPU ledger**, runtime не изменён и реальный coverage всех GPU read paths серийным счётчиком ещё требует интеграционного теста.

## Moving P/C, неподвижный DOT: конкретные composite gates

Readonly `preview-fringe-math-audit.mjs` PASS на выбранных literal формулах, без runtime изменений.

Главный проверяемый барьер: composite silhouette строится из **исходной coverage1024**, её ring blur и u_spreadPx (`shaders.ts:1676–1774`). После spread/dry-contact coverage<0.004 (`:1912`) возвращает original при rectComposite. Ненулевые транспортированные P/C не отменяют этот return. Поэтому diffusion может расширить P/C в общий мокрый domain128, но за исходной coverage+малой spread-кромкой картинка остаётся прежней. Radial probe должен сопоставить в одних мировых координатах transported P.B/C.A, source coverage, computed spread coverage и final alpha. Это сильная гипотеза видимости, не установленная причина actual109/113-step результата.

Q8 thresholds не следует объединять: raw coverage1/255=0.003922 ниже0.004; ink/depth в composite умножаются2 (`:1589,1600`), поэтому несглаженный1code=0.007843 проходит ink.a>0.004. Но wcInkAvg center-only даёт4/(14*255)=0.00112: при изолированной слабой ячейке smoothing может вернуть fallback water/strength. Соседние taps находятся в pixelUV назначения1024 и обычно попадают в тот же128texel; пример center-only — возможный boundary pattern, не факт actual равномерного поля.

ThinPrior (`:1618–1635`) стабилизирует цвет соседним **depth**, не гарантирует видимость P.B. Если C.rgb и локальный C.rgb округлились в0, tauPrior/tauHere=0, paint=white, density=0 даже при P.B>0. Если вокруг есть ненулевой depth, prior восстанавливает finite поглощение. На128 nearest texture offset2/1024 меньше texel1/128: четыре prior taps часто читают тот же пустой cell и не достигают ближайшего ненулевого цвета. Это осмысленный отдельный probe.

Даже положительное finite поглощение может дать0 после финального RGBA8: например pigmentMass2/255, tau0.05, thickness=mass*0.55/0.54 дают density≈0.000399 и round(255*density)=0. Production final alpha дополнительно умножает coverage, opacity и другие факторы (`:2207`), поэтому это пример возможной невидимости, не доказательство суммарной потери пигмента. Глобальный mass не измерялся.

Не исправлять автоматически пороги/дозу. Сначала отделить silhouette-clipping от low-depth/Q8 исчезновения в actual radial probe; после него нужен отдельный визуальный preview-domain контракт, который не подменяет материальную across/standing coverage бинарным support.

## Feasibility: отдельная visual render coverage, не transport domain

Это предложение **до actual radial proof**, не runtime patch. Маска нужна только если radial показывает ненулевые P/C за source silhouette и composite coverage-return скрывает их.

Разделить три значения: immutable material coverage1024, transport-domain128 и **собственный** render-coverage1024. Composite получает последний; solver/source/canonical никогда его не читают. Нельзя расширить source.coverage на месте, нельзя использовать бинарную water-mask как pigment-alpha.

Минимальный причинный диагностический вариант: materialSupport=true только когда sampled P.B>0 **и** C.A>0 **и** max(C.RGB)>0. C.A не обязана≤P.B. Water-only имеет P.B=0/C=0, поэтому не расширяет coverage и не рисует белую краску. Positive P с нулевым optical-depth RGB также не расширяет силуэт: production tauHere=0 при пустом local-depth даёт белый/нулевую плотность. Это строгий diagnostic guard; prior может восстановить тон там, где локальный RGB0 — такие случаи здесь сознательно не включены, требуют отдельного low-depth probe.

На материальном support diagnostic ставит A'=max(Aold,1). Это не новая доза: плотность продолжает определяться P.B/C moments/Beer–Lambert; A лишь открывает existing composite coverage-return. Сам composite spread/dry-contact всё ещё может уменьшить итоговую coverage, поэтому маска не гарантирует видимость.

Для исходного Aold>.004 сохранить decoded across и pool: R'=Rold*A'/Aold, G'=Gold*A'/Aold. При внестаромконтуре R'=0.5*A', G'=0 задают neutral across/no historical pool. **B'=Bold** без нормировки: production standingHere читает B напрямую. На новых пикселях Bold0 остаётся0; вода читается из P.R/P.A, а V.R/A не превращается в thickness. Изменять standing вне footprint можно только после отдельного dose-контракта. Если внутри старой coverage A не меняется, literal RGB/Q8 остаются прежними; при росте A сохраняются ratios с неизбежной≤0.5code округлённостью — это visual-only изменение, не exactsame-model.

Budget: один own RGBA8 render field1024² =4MiB/lease; до3slots ещё12MiB, общий pool≈25.125MiB вместо13.125MiB. Один full1024 draw на update (чтения sourcecoverage+P+C), без CPU readback; стоимость аппаратно неизвестна. 128 output экономит память, но ломает обещание исходных Q8 across/standing, поэтому не выдавать его за preserved material geometry. Reset render field из immutable coverage при новом epoch; retirer/fence по тому же ledger.

`preview-render-extension-oracle.mjs` PASS: исходное поле не меняется; water-only/zero-optical-depth не расширяются; outside нейтральное across; standing exact; non-C<=P.B vector принят; decoded ratios сохранены в пределах Q8. Это тест ограничений предложения, не доказательство натуральности или shader качества. Runtime/GPU не изменены.

## 113 Q8 diffusion steps: независимый flat-paper контрпример

`preview-diffusion-q8-audit.mjs` использует literal eight-neighbour king stencil, D=.09, fullwetgate, constantheight (B*dh=0), closededges. В вещественной арифметике4code-total сохраняется после113steps. При округлении каждого framebuffer write в ближайший u8 isolated4code→1code→0 за2steps: outgoing .36code каждому соседу округляются в0, centre1.12code→1; затем centre.28code→0. Поэтому математическая pair-conservation **до** записи не доказывает сохранение слабого P.A/P.B/C после повторных Q8 записей. Для255code пример печатает timeline; не выдавать его за actual бумагу/domain/driver rounding.

Этот механизм и silhouette clipping независимы. Actual radial должен показать растёт ли область **ненулевых** P.B/C.A, где A/RGB округляются, и как это сопоставлено с final alpha. Для actual loss нужен total всех каналов128² до/после, не crop и не только радиус.

`preview-render-extension-fixtures.json` — четыре компактных uniform-input bounded fixtures (old-zero/partial/full +water-only), source1024/preview128 NEAREST, no GPU/runtime invocation. Если radial опровергнет clipping, proposed arm отбрасывается. Во всех arms immutable coverage и canonical endpoint обязаны оставаться прежними.

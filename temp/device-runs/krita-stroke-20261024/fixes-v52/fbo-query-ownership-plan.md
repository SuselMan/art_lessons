# Следующий FBO/query scope — read-only review

Actual HEAD709a41e58 + root AccumulationBuffer.storageOwnerCurrent WIP.
Samsung/foreground не затрагивались: Color владеет native GUI proof.

## Найденный контракт

- BrushGlBatchFrame.bindTarget всегда bindFramebuffer, затем для первого FBO в
  текущем frame checkFramebufferStatus + getFramebufferAttachmentParameter.
  Повтор в том же frame сверяет snapshot geometry/texture. Новые frames снова
  делают оба запроса. Это синхронные API timings, не GPU timer.
- CanonicalLayerTargets связывает настоящие straight TiledLayerBuffer tiles,
  retainTargets проверяет exact tile→buffer identity до bind и при каждом lease.
  Eviction/clear/destroy запрещены при удержании. Shared lifetime покрывает <=64
  snapshot targets. Source fields texture/fbo/dimensions доступны как metadata.
- AccumulationBuffer attaches COLOR_ATTACHMENT0 в constructor один раз. Среди
  production engine writers дальнейшей перенастройки его FBO/texture не найдено;
  GpuBudgetFence и prepass присоединяют собственные FBO. Handle fields _fbo/_texture
  технически доступны, поэтому неизменность layout является INTERNAL contract,
  не защитой от произвольного вредоносного внутреннего GL callback.
- Constructor проверяет cold GL errors и FBO status один раз на context, не на
  каждый buffer. Trust fixed layout не равен новой аппаратной аттестации каждой
  allocation. Это явный risk/review choice, а не скрыто снятая проверка.
- Новый root storageOwnerCurrent даёт !destroyed && all leases current без GL
  queries и отличает старую generation даже при неизменном WebGL handle.

## Вариант A: только fixed external layouts

Точный production scope: BrushGlBatch.ts, CanonicalLayerTargets.ts,
CanonicalFrameExecutor.ts. CanonicalRgba8CompositePass runtime не менять:
frame.bindTarget получает уже существующий target с lifetime; standalone private
bindTarget сохраняет обе старые hardware guards.

Расширить existing lifetime optional immutable ownedFramebufferLayouts (snapshot
actual AccumBuffer texture/fbo/context/width/height/world origin + epoch/lifetime).
Layer binding публикует только свои retained actual buffers. Raw executor — только
actual exclusive straight pool local; foreign/cache/prepass/pingpong не объявляет.
До/после owner acquisition и на bind сверять exact declaration/source/handles,
same context, current storage lease/generation, target geometry и объявленный
lifetime. Никаких mutable layout callbacks. Не считать payload/profile authority.

Использовать SAME existing per-frame targets dictionary, отличая admitted fixed
metadata от уже использованного binding; никакой persistent registry/state cache.
Учесть все admitted snapshots в existing per-frame CPU allowance (а не fake free
metadata); пределы привязать к существующим64 retained/owner bounds, без нового
GPU cap/pool. Для exact valid fixed binding пропустить ТОЛЬКО status/attachment
queries; bindFramebuffer и полный state capsule остаются. Undeclared foreign
bindings проходят прежние guards; конфликт/дрейф объявленного target — отказ.

Риски: обещание запрещает переattachment/resize/delete во время exclusive borrow;
это не обнаруживается одним JS identity comparison. Если review требует аппаратный
certificate на каждый новый FBO, нужен отдельный cold-boundary contract в root-owned
AccumBuffer (не добавлять тихо и не вносить горячие проверки вместо одного cold).
Metadata должны не удерживать новое pixel storage и не переживать frame/binding.
Все releases/state restoration/первый exact error сохраняются при отказе.

Tests-first: genuine retained-layer +rawpool identities; fixed binding no hardware
queries; foreign/standalone/cache old queries and changed-attachment rejection;
wrong context/texture/FBO/geometry/lifetime; stale ledger with unchanged handles;
source replacement between acquisition and bind; acquisition callback throws,
reentry/loss/cleanup throws; retained tile eviction/destroy protection; actual
multi-gesture preview/commit numerical tests. Exact tests: BrushGlBatch.test.ts,
CanonicalLayerTargets.test.ts (existing if present), CanonicalFrameExecutor.test.ts,
CanonicalRgba8CompositePass.test.ts. Focused/lint/common slot, then same5 Samsung
paired source receipts after Color handoff; no latency guarantee.

## Вариант B: paired capacity benchmark без production активации

Production chooser сейчас НЕ найден. rg по apps/web/src показывает только сами
сервисы и coordinator/executor; настоящих new Prepass/Composite/Coordinator вне
unit/diagnostic нет. Engine constructor/reader frontier всё ещё закрыт. Поэтому
нельзя назвать8/64 выбором текущего editor UI или заявить его ускорение.

Последний actual5 harness имеет64x64 target и deliberately composite8x8, что
разбивает полный tile на64 части. Earlier diagnostic factories обычно выбирали64.
Пара8/64 меняет только existing composite prepare limits, остальные source/input/
profiles/seeds/masks/layers/CPU oracle и owners неизменны. 64 даёт один полный tile
part, но может увеличить unpreemptible driver/GPU burst; проверить, не предполагать.

Формула existing composite budget: GPU width*height*4+48;
8²=304B,64²=16432B, delta16128B на один prepared workspace; CPU для3programs
8192*3+48=24624B в обоих вариантах. Все реальные charges и finite owner сохраняются.
Prepass нельзя сжать до64 для source600: executor прямо отвергает recipe больше
capacity. Сохранять actual maximum600/306 и slots1; runtime diameter600→48 — иной
native/source gate, сюда не входит. Prepass budget unchanged:
GPU524288 + height*288 + width*height*4; CPU524288 +height*(288+512).

Exact diagnostic edit scope: generic-sc4-real-source-body.js и profile-body.js
читать CONFIG.compositeSize вместо literal8; runner принимать только8/64 и pin
selectedcapacity/source hashes. Host point oracle не менять. Параметр не становится
production policy. Сравнить80surfaces exact/turn+query counts/max wall/setup/cleanup
на одном устройстве sequential после native GUI proof. Отделить observer/query API
latency от GPUcost и cold preparation; не вводить shader changes/renderer/stand.

Рекомендуемый порядок для review: capacity pair — без новой ownership authority;
либо сначала narrowly-approved fixed FBO promise, затем отдельная capacity pair,
не смешивая два изменения в одном before/after.

## Root review decision

Root выбрал cold certificate на КАЖДУЮ newstraight allocation, до publish:
status+actualCOLOR_ATTACHMENT0 exactlyonce. PMlegacy остаётся once/context.
Readonly verifiedFramebufferLayout {gl,texture,framebuffer,width,height}|undefined:
stablefrozenobject только coldverifiedstraight; getter проверяет actualhandles,
geometry и storageOwnerCurrent безGL. Root owns AccumBuffer +MockGL/faulttests.
Consumer scope одобрен3paths выше, но не реализован этим read-only plan:
публиковать source+captured certificate identity+world origin в existing lifetime,
проверять до/послеacquire иbind. General/foreign/standalone guards сохраняются.
Capacity8/64 pair отдельный gate после Colorhand-off, productionchooser покаOFF.

# Синхронный GL batch, без нового raster закона

Internal opt-in coordinator `runBrushGlBatch`: прежние `resolveGroup`/`drawSource`
исполняют те же validation, row staging, copy и draw bodies. Optional второй
аргумент frame только объединяет state/lease scopes. Существующий standalone API
сохраняет все isTexture/isBuffer/sampler/FBO guards и самостоятельное восстановление.
Численные shader strings, source geometry, wire и текущие painters не изменены.

Основание для оптимизации: private R52/canonical-stock-perf-device-result.json,
stock84, 1234 requests. Instrumented readonly GL methods заняли около5.645s из
6.740s, в том числе getParameter/getTexParameter/isTexture/isBuffer/FBO status.
Instrumentation влияет на измерение; это не обещание фиксированного ускорения.

Batch predeclares prepared services, extra cached resources и exact external
lifetime objects. Проверяется одна gl/cache/BrushMipCache/extensions identity,
actual cache charges и GPU union<=существующего budget. Никаких GPU allocations.
Transient CPU reservation из того же BrushMipCache:
4096+96*resourceCount+96*ownedSamplerCount+128*ownerCount+256*participantCount bytes. Это conservative
metadata estimate, не hard JS/driver heap guarantee. Reserve освобождается finally;
новой квоты нет. Ограничения declarations:<=8participants,<=64owners,<=1024resources.

Bookkeeping/service entry/cache lease не меняют GL. Один capture ПЕРЕД external
lease callbacks покрывает и их GL-binding mutations/throws. Epoch проверяется
после acquisition и перед каждой командой. Attribute union всех prepared programs,
texture units0..2, прежняя BrushGlState capsule и caller OES/ANGLE/fallback pointers.
Sampler journal хранит4 параметра на unique sampled texture. FBO completeness и
attachment проверяются один раз на unique held framebuffer; смена texture/geometry
того же FBO в batch отклоняется. Leases удерживаются до восстановления sampler
journal→caller GL state; после этого освобождаются owners/cache/services.

Никакого ambient currentFrame. Frame constructor/open/close требуют module-private
capability; participant admission только during acquisition. Closed/foreign/stale
frames, reentry, prepare/reset/releaseOwner во время scope и thenable return
отклоняются. Callback internal synchronous: произвольные GL writes/owner mutation/
await запрещены контрактом. Lost context пропускает GL restore, cleanup leases и
CPU reservations выполняется. Ошибка cleanup не заменяет первичную command error.

Caller уступает event loop ПОСЛЕ batch. shouldYield сигнализирует >=8 submitted commands (включая empty clips),
>=8groups либо >=4ms после первой команды/группы. Только hard8 command/group bounds отклоняют следующую команду.
Wall-clock deadline кооперативный: metadata между caller shouldYield check и
следующим beginGroup может пересечь4ms, но это не отказ/потеря команды. Уже admitted prepass group получает право завершить первый paired
composite draw, даже если mask preparation пересекла soft4ms; hard8draw cap остаётся.
Group token/release не затрагивает новое поколение. До8groups на batch; следующий
resolveGroup требует release предыдущего. Незакрытая группа закрывается finally.
Это bounded command submission, не гарантия завершения одного GPU draw за4ms.

39 focused CPU/MockGL checks на момент реализации: common real prepass→composite
one-capture, HIT/MISS, FBO/sampler query counts, exact caller pointer/divisor/VAO
restoration, owner callback mutation/failure, draw failure, reentry/thenable,
context/cache/epoch/undeclared resource checks, bounded command/time crossing.
Это lifecycle/state доказательство, не CPU shader mirror или GPU pixel oracle.
На Samsung SM-T970/Adreno650 новый batch прошёл отдельный brush84 ABBA gate
(source15f484ede; private R52/canonical-stock-batch-device-result.json):
standalone/batch/batch/standalone по1234 draws, все RGBA bytes exact, GL[],
hotNoUploads/stateRestored/cleanup true. Total wall10477.7/5534.0/3347.3/17408.1ms;
order/thermal drift не позволяет обещать универсальный коэффициент. Batch scopes
556/449, getParameter6694/5410 против28404 на standalone; getTexParameter
4084/3580 против4944. Общие maxrAF133.7ms/maxturn154.6ms включают standalone
и cold work, поэтому не доказывают отзывчивость batch. Полный17-brush batch gate
на момент первого brush84 gate ещё ожидался; дальнейшие результаты ниже. Это standalone source proof,
не новая сборка активного приложения и не native fused arithmetic identity.
Прежние isolated pass proofs
1bc11f408 и a70d8c2e0 остаются привязаны к своим источникам/receipts; новый
brush84 gate дополняет их, но не расширяет численный профиль или engine coverage.


## Owned sampler capability

`BrushGlBatchInfo.ownedPointSamplers` объявляет только внутренний owning service.
Первый и единственный production producer — private prepass output slots,
созданные factory NEAREST/NEAREST/CLAMP/CLAMP. View — immutable-sampler borrow:
borrowers и external lease callbacks не вправе менять texParameteri этих slots.
Это не caller flag, asset brand, format/vendor policy или cross-frame GL cache.

Entry(key,texture,bytes,epoch) проверяется против exact prepared cache union,
actual key/handle/charge и participant epoch до capture/acquisition. Два owners
либо key/charge/epoch aliases одного handle отклоняются. На каждом skip sampler
owner epoch и actual residency проверяются ещё раз; context/reset не сохраняет
capability в следующем frame. Sampler metadata CPU map включён в тот же reserve.

Только такой source не попадает в journal и не вызывает sampler query/set/restore.
Внешние straightRGBA8, synthetic cached masks и все standalone APIs по-прежнему
сохраняют4actual params, временно NEAREST/CLAMP и возвращают их даже при throw.
Mixed regression показывает owned0query + external4queries/unique; exact real
prepass→composite test подтверждает0samplerqueries на двух ordered draws. Stale
owner epoch, wrong key/handle/charge и conflicting aliases reject до effects.
43 focused tests PASS; это CPU/state checks, не device pixel receipt нового пути.

Baseline guarded full17 Samsung gate относится к **15f484ede**, до capability:
17presets/3256requests/203chunks, wrong0/GL[], hotuploads0,
actualstateRestorationChecked/stateRestored/cleanup true. Receipt private
R52/canonical-stock-full17-batch-guards-device-result.json. Accepted baseline
не заменяет fresh owned-sampler GPU proof, приведённый ниже.

Fresh source **bd9ea222e** independently passed Samsung SM-T970/Adreno650
WebGL1 gates:17 canonical strokes/3256 draws/203 checkpoints;102 synthetic
AlphaDarken trials;64 Over trials/192 draws. All final bytes/checkpoints exact,
GL[], hot uploads0, actual caller-state restored, external sampler parameters
and leases restored/balanced where measured. Composite phase sampler queries0;
236 remaining queries belong to59 external outer calls (four each).

Private R52/owned-sampler-gates-summary.json pins receipts and bundle hashes;
canonical-stock-owned-sampler-full17-device-result.json,
owned-sampler-canonical-composite-device-result.json and
owned-sampler-composite-over-device-result.json are separate from older baselines.
Owned child tabs/contexts/resources/jobs were closed, original parent restored.
The17-stroke instrumented run total13.269s includes guards/readbacks/getter timing;
it is not unbiased speedup evidence or a responsiveness pass. These scalar
profiles remain isolated from active room storage/wire and installed fused
scalar/vector dispatch, and prove neither all118 presets nor native identity.


## One captured state across direct preparation and one draw batch

runBrushGlTurn owns a synchronous full-state capsule before any direct target allocation/copy or external lease callback. A genuine module-minted opaque token can be passed explicitly to ONE inner runBrushGlBatch with exactly the same participants, GL/cache/CPU, epochs, extension identities and declared attribute union. Invalid/foreign/reused/expired/nested authority rejects before GL work/acquisition. WeakMap authority records are deleted at outer exit, so a retained expired empty token cannot retain captured GL state/handles. The context WeakSet is only a reentry rejection guard: no implicit current-token lookup, ambient GL cache or cross-turn state reuse.

The outer scope reserves the existing4096base CPU workspace once; a borrowed inner frame reserves only its existing resource/sampler/owner metadata. Tests use a4500byte total budget, proving peak4096+256+128 rather than a second4096 allowance. No lease/capsule/authority crosses a yield or promise; asynchronous callback return rejects and closes authority.

The SAME full snapshot is restored twice: inner finally before owner lease releases (borrowed handles still retained), then outer finally after owner/preparation cleanup callbacks. There is ONE capture/getter set, not a second state owner. External sampler journaling/target attachment validation remains. Journal cleanup now attempts independent sampler restores after setter faults; primary draw/preparation failures survive group/restore/owner/release failures and cleanup attempts continue. Lost contexts skip GL restore while releasing reservations/authority. Every binding, epoch and declared attribute identity is rechecked after owner acquisition and on frame assertions.

Direct preparation audit: AccumulationBuffer constructor/clear/copyTo and RibbonScratchPool acquisition alter texture/FBO/clear/copy state, not vertex attributes. The existing declared prepass/compositor attribute union covers this direct path. TiledLayerBuffer.recoverTiles invokes arbitrary history rebuild callbacks, which are NOT generally certified by that audit: nested canonical turns deliberately fail closed, and legacy premultiplied replay cannot be assumed valid for straight canonical history. Reentrant recovery requires a future declared-state/recovery-before-turn contract; this performance unit does not broaden recovery admission or capture all unknown attributes to hide the gap.

Host tests cover one capture before actual target preparation; exact4096base sharing; preparation/owner/group/draw/restore faults and primary identity; sampler best effort; context loss; async/reentry/expired/forged/foreign tokens and drifted epochs/attributes; genuine token deletion; and a target-preparation history reentry rejecting before pixels/escaped leases. Standalone runBrushGlBatch retains its ordinary independent capture path.


Actual Samsung ONEcapture gate: `fixes-v52/auto7-one-turn-64-result.json` covers all seven actual imported author→adapter→V2 executor cases; `auto7-one-turn-8-result.json` covers two real41/61px masks through actualmask64/pass8 local and presentation parts. Both final pixel comparisons to host source-law CPU expected: wrong0/maxDelta0, state restored, GL[], no poison, all tracked GL handle counts0 and balanced CPU/GPU cleanup. These are not independent native GUI whole-stroke identity or UI responsiveness proofs. Cleanup receipts confirm child tabs closed, parent restored and marker removed; executing parent reported forward removed/DEVICEFREE.

ONEcapture source SHA256 `5d2ae3d172059b7e2db0d94e91467f9f33d1cfb545aba699dbaf5d104d7ef73e`; executor `285be6a1170e511a9ad6af66df3891aa3357f137622f64295f916137031d40f5`. Bundle `4c10a9a743fbe9417d9fe9aca5f565eba4a63d932be3da377af70f8f5d5d3358`. Pixel body `a5d02e683e9fabebd13f351ac6d288bb6288475f915dbfef45ef785f88698382`; fixture64 `dd2eaea13f86e76fc5fd02b62f70f21b9f8d65d5e105d028f65fd685b1cf602c`, fixture8 `ec0ea4076013155aa559644457dfd4289d49e2d496b2f03b7342fdcae88976a1`. Runners `run-auto7-one-turn.mts` and `run-auto7-one-turn-phase-profile.mts`; snapshots retained in each result.

The closest structural baseline `auto7-derived-phase-profile-result.json` versus `auto7-one-turn-phase-profile-result.json` confirms full-capture getParameter744→372 and isEnabled372→186;75 upload queries are unchanged. HOWEVER cold sequential35-advance inclusive CPU/GLIPC time211.2→246.1ms did not improve. Earlier baseline234.8ms/780+390 included three extra empty-frame capsules. No latency/speedup or shader-throughput claim is supported: paired warm measurements and further profiling are required. Profile body `15ca6c22545815ab44a05ae239af4a4cad738ea5f316a9540e0f7641248ef390`, fixture `bbb838719397f0072f4ff2d183cc61a7abb7bd50944ff12829562a6fc8f65eb5`; same frozen bundle/source, pixel errors0.

## 2026-10-31: lifetime-owned raw-local point sampler

The existing synchronous frame ownedSamplers dictionary now accepts one optional
point sampler declaration on an existing lifetime. This is a TRUSTED INTERNAL
owner promise, never decoded material/profile/wire authority: immutable nearest
and clamp sampling for the exclusive borrow. The declaration pins actual buffer
source getter, texture, same GL context and the owner's alive epoch. Its identity
is checked before ownership effects, after all acquisition callbacks and at each
fast-path use. Replacement, epoch retirement, alias conflict, metadata drift and
foreign context refuse the declaration. Acquisition context loss refuses work.

The actual deposition-only executor supplies a frozen declaration ONLY for its
straight/nearest pooled raw local. Existing pool/AccumulationBuffer contracts
prohibit straight-linear buffers and straight mip sampling; exclusive raw-local
borrowers do not modify constructor clamp sampling. Existing cache-owned sampler
validation remains. Undeclared/foreign samplers still query, set and restore all
four parameters; standalone composite calls deliberately ignore this fast path.
The promise is NOT a sampler attestation against arbitrary malicious internal GL
mutation. Such mutation violates the exclusive owner contract.

No global state mirror, handle journal, queue, quota, renderer or room activation
was added. The existing frame dictionary,64-owner limit, per-sampler96B estimate
and owner128B estimate apply. Existing full GL state capsules, FBO attachment
checks, all-attempt release/first-error handling and source numerical profiles stay.

Seven tests-first feature failures and one foreign-context failure were recorded.
Tests cover malformed/retired/conflicting metadata, identity drift in acquisition,
texture replacement at use, release after errors, first exact failure, reentry,
loss, retained foreign sampler restore, actual raw-local producer and standalone
fallback.134 focused tests/3files +56 regressions/5files, lint and combined app/SW
TSC pass. R52/generic-sc4-owned-sampler-proof.json pins exact device source bytes.
Actual Samsung same5 NEW descriptors80 full64² surface observations remain exact;
non-observer sampler queries1676→0, instrumented worst70→41.2ms, clean sampled
worst83.1→36.2ms. These are JS/API wall-time samples, NOT GPU timings or a4ms
latency guarantee. General state/FBO synchronous-query delays remain possible.

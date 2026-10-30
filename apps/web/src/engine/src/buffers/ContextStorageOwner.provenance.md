# Requested context storage ownership

## Initial Accum stage (51cb40a57)

This is an independently authored ownership/admission ledger, not a rendering algorithm or a physical GPU residency measurement. It counts requested AccumulationBuffer RGBA8 base/mip storage exactly once per actual GL context epoch. The engine attaches with Infinity only. Raw textures, VBOs, drawing buffers, driver overhead and deferred deletion remain outside this **incomplete** domain. The watercolor budget retains its old meaning.

A reservation is a promise; a successful allocation transfers only the materialized bytes to a lease. Closing a caller-owned reservation remains the caller's responsibility. Failed construction does not consume its remaining promise. Pool release retains resident bytes; pool reuse adds none; actual deletion refunds once. Resize needs both old and new storage headroom. Same-context engine replacement reuses the same owner rather than resetting existing charges.

Allocation boundaries report one consumed preexisting GL error before mutation, rather than draining it or calling it allocation OOM. The texture/FBO and first mip allocation boundaries check void GL errors. No GL queries are introduced on draws or metadata snapshots. Healthy deletion uses the API-defined deletion operation; there is no per-destroy getError. A JavaScript deletion exception after attempted storage leaves a conservative **numeric orphan charge included within residentBytes**, not added to it again; it has no retained texture/handle/retry journal and clears only on context loss. FBO-only cleanup failure does not invent texture storage. Failed first mip generation may already have allocated levels, so its worst-case chain remains charged to the actual texture until deletion. A separately confirmed flag prevents conservative accounting from being mistaken for successful generation: repeated failed first-generation retries stay on the cold-checked path with zero additional reservation/charge until success.

Context loss invalidates the old owner and FBO-completeness epoch. Stale reservation use rejects, stale lease destruction cannot subtract from or delete names in the restored epoch. Default engine construction has no finite cap: its existing constructor-wide partial-init rollback is not complete, and exposing a finite engine option would create an unsafe new failure path. Finite policy is currently internal/standalone Accum capability only. Real engine finite admission requires constructor cleanup/preflight, raw-owner migration and explicit measured policy in subsequent units.

Evidence: fixes-v52/accum-owner-{focused,buffer-regressions,final-focused,final-regressions,common-web-tsc,lint}.log. Host MockGL integration tests verify actual constructors, scratch pool reuse/trim, two real engines sharing one context, external ticket consumption, resize peak, unknown/foreign/stale tokens, allocation GL errors, partial cleanup and numeric orphan semantics. These tests do not establish driver memory use or prevention of browser tab OOM. No device/runtime/dependency resource was created for this unit.

Final host gate: 172 tests across 20 buffer/engine ownership files passed, including repeated void mip OOM→retry→success and constructor framebuffer cleanup despite deletion faults. Common web typecheck and scoped lint are recorded alongside the tests; no device performance claim.

Subsequent actual Samsung SM-T970/Adreno650/Chrome155 regression uses source
at51cb40a57: seven Gaussian author/adapter/packed V2 paths through the actual
executor/Tiled/scratch/prepass/composite64, plus largest two masks/composite8.
All9 final64×64 surfaces match host source-law expected (wrong0/maxDelta0),
hostile GL state is restored, GL[]/poison[], and all owned GL handles are zero.
The actual context ledger is observed after every trial cleanup: resident,
reserved and orphan bytes are all zero, with complete=false. Infinity is serialized
as null in numeric JSON snapshots; no finite engine policy was activated.
This proves the tested allocation/cleanup paths, not original GUI identity,
physical GPU residency, tablet OOM prevention or UI latency. Both children closed,
original three tabs preserved, parent restored, forward19236 and job markers
removed. Durable receipts: fixes-v52/gaussian7-owner-executor-device-summary.json
and gaussian7-owner-executor-{64,8}-{result,cleanup}.json (source/bundle/body hashes).


## Raw brush cache migration

The same numeric registry now also has closed `brush-texture-rgba-equivalent`
and `brush-buffer` domains. Accum compatibility functions are fixed-domain
forwarders/projections, not a second ledger. Texture charge matches the existing
cache RGBA-equivalent policy including supplied levels; ALPHA/LUMA/LA are not
misrepresented as physical RGBA allocations. Buffer charge is requested bytes.
Context total sums the domains once; getWatercolorPerf keeps bufferStorageMB
Accum-only, retains rawBrushCacheChargeMB as local eviction attribution, and
reads knownTrackedStorageMB from context total without adding cache charge again.
The engine remains Infinity/complete=false and watercolor policy is unchanged.

Actual Brush/Smudge misses reserve from their existing preparation metadata
before CPU mip builders; uploader validates every selected level before GL,
consumes explicit caller tickets and returns unpublished ownership. Bank job,
prepass LUT/slot/VBO group and composite scratch/VBO use their real frozen job or
capacity manifests. Companion metadata references existing storage and adds zero
charge. No image math, masks, profiles, mip sampling policy or stripe data changed.
Bank/prepass/pass share the same injected cache; distinct painter caches remain
distinct owners. CPU mip/staging reservations retain the existing BrushMipCache.

A bundle is transferred once to the cache. Failed publication cleans only
unpublished storage and preserves its primary error. Merge validates all parts'
current epoch before consuming any owner. Metadata-only cache.get fails closed
on old-epoch handles until explicit clear. Cache eviction/discard/clear and
bank/prepass/composite reset attempt all owned cleanup; each texture/VBO lease
is released according to that part's deletion outcome. Auxiliary FBO/program/VAO
cleanup never invents charged bytes. Failed deletion records only numeric orphan
charge, with no retained retry journal. A false lost=true reset on a healthy
current epoch cannot refund live storage; actual epoch loss clears all domains
and old cleanup cannot affect new allocations.

Tests include existing source-backed default/Gaussian masks and composite/state
regressions plus new ownership faults: malformed later mip before GL, attempted
levels only on partial upload failure, domain/foreign ticket rejection, duplicate
adoption, two distinct caches and one shared canonical cache, group denial before
CPU/GL allocation, VBO rollback with deletion failure, primary preservation,
stale/fresh merge rejection and old-epoch handle lookup. Arbitrary LRU test weights
use a real 1x1 texture plus VBO remainder, explicitly not a native mip-image proof.
Evidence is fixes-v52/raw-owner-{focused,new-faults,latest-faults,last-faults,broader,common-web-tsc,lint}.log.
No device, runtime, build copy or dependency resource was created for this stage;
previous Samsung receipts above retain their historical source hashes.

This still is not a complete global allocator: paper/wet/selection/import and
other utility/stamp/ribbon VBO writers, opaque driver overhead, constructor-wide
rollback and a measured finite engine policy remain activation gates. Logical
requested charges and conservative orphans do not prove physical residency or
prevent browser OOM by themselves.

Raw stage final host gate: 614 tests/56 dabs, buffer and actual-engine ownership
files passed; common web typecheck37363 passed. Painter-owned destroy now also
attempts migrated cache cleanup after earlier behavior/scratch failure and retains
the original error. Whole-engine constructor/destroy rollback remains separate.
Scoped lint has no errors (existing engine warnings), map/check and diff/check
passed. No new GPU execution or physical-residency measurement is claimed.


## Samsung total-ledger regression at 01bb746b4

The new isolated runner uses snapshotContextStorage rather than the historical
Accum-only projection. On SM-T970 / Chrome155 / Adreno650, all seven Gaussian
fixtures at composite64 and the two largest at composite8 produced zero differing
RGBA bytes against the same frozen host source-law expected images. GL error and
poison lists were empty, sentinel state restored, and actual texture/FBO/buffer/
program/shader handle sets empty after cleanup.

Snapshots before preparation completion and after execution observed positive
resident charge in all three domains. Every trial cleanup and final snapshot had
zero resident, reserved and orphan bytes in each domain and context total.
An initial harness gate failed because it sampled only before lazy Accum creation;
its original receipt is retained. Adding a post-execution observation fixed that
evidence gap without changing production code or expected pixels.

Durable reproducible inputs and source/body/bundle hashes are in fixes-v52/
run-gaussian7-raw-owner-device.mts, gaussian7-raw-owner-executor-body.js and
Gaussian receipts gaussian7-raw-owner-executor-{64,8}-{result,cleanup}.json;
gaussian7-raw-owner-device-summary.json records both outcomes and the initial
observation failure. Test children closed, original tabs restored, QA markers and
ADB forward19236 removed. No service or dependency copy was created.

This tests migrated allocation/cleanup paths and pixel-preserving ownership;
it does not establish physical GPU residency, original GUI stroke identity,
active pointer responsiveness, iPad behavior, or a safe finite global cap.

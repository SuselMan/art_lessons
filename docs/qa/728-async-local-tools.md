# #728: локальные инструменты при занятой canonical FIFO

Кандидат от cbe52652, `_wcAsyncFinish` по-прежнему выключен по умолчанию. Реальный двухавторский Room выявил отказ `_onStart` для pencil, пока удалённая акварель занимала FIFO. Исправление принимает обычный input и немедленно записывает/отправляет операцию; её material replay выполняется после старых запросов.

Презентация использует отдельные копии только затронутых тайлов выбранного слоя и обычный painter. Слой компонуется с прежней opacity; eraser удаляет alpha копии, не рисует белый overlay. Следующий локальный штрих копирует предыдущую ожидающую презентацию. Канонический экспорт не читает эти копии. Консервативный общий лимит 64 MiB учитывает до восьми ribbon buffers на тайл; превышение выключает только preview, сохраняя dabs/journal/ACK. При потере контекста accepted journal остаётся, transient handles забываются без GL удаления. Незавершённый неотправленный хвост не объявляется сохранённым.

CPU: 24 async tests, совместно 49 tests (async/peer-live/peer-preview/context/FIFO) PASS. Pencil/marker/eraser/smudge: canonical до drain неизменен; settings preset/color/layerId лочатся на старте; callback один; после drain packed replay byte-exact. Eraser alpha уменьшается; два ожидающих pencil previews сохраняются; cap не теряет delivery. Настоящий web typecheck, lint, map:check PASS; map:rules 0 errors/4 прежних warnings. Логи: `temp/async-multiplayer/local-tools-*.log`.

Это CPU gate, не аппаратная проверка. Обычный Room, multi-peer, undo/redo/reconnect/loss и фактическая видимость/GL проверяются отдельным hardware matrix до включения по умолчанию. Smudge на ещё не завершённой акварели показывает предварительную копию; окончательная краска определяется FIFO journal replay.

Multi-tile review: preview представляет union всех ожидающих tiles слоя; latest побеждает только совпавший origin. Отдельный двухтайловый тест предотвращает исчезновение первого штриха. Smudge preview imprint/replay-chunk освобождается по собственным userId/strokeId; потеря контекста не удаляет мёртвые GL handles. No-ACK тест явно сохраняет pending=true/state=done после drain: optimistic material не ждёт сервер.

## Реальный Room и deferred structural derivation

Combined6b, current4539, два настоящих authors, custom physical640×480: B pencil принят во время A queued watercolor (1 ACK, active max33 ms, 0>100). Зафиксирован реальный pencil live packet при pending FIFO. Но queued layer_add→Undo оставил B UI-layer в старом состоянии, хотя оба authoritative journal уже содержали undone add. Обе GL0/lostfalse, canonical FIFO закончена. Поэтому весь matrix FAIL, defaultOFF сохранён. Raw HOME `680-water-wet-tone-qa/temp/async-multiplayer/results-local-tools/report.json`, VPS `temp/async-multiplayer/local-tools-hardware-report.json`. A idlefalse пока отдельно исследуется.

Причина B UI: network syncFromLog происходил до deferred log append; последующий _opQueue drain не уведомлял Room. Новый узкий callback onQueuedOperationApplied после фактического применения запускает derivation от текущего OperationLog. Это не ручное исправление layer state и не повторный ACK/append. CPU remote add→undo callback видит done→undone; Room hook только derive/checkSnapshotBoundary. 35 tests PASS, web types/lint PASS. Аппаратная проверка этого callback ещё впереди.

Snapshot/checkpoint audit: `_snapshotQuiet` теперь отказывает при canonical FIFO pending, physical owners и local preview owners, включая промежуток без `_settle`. ACKed pencil operation остаётся dirty и bake=null до material commit, после drain bake разрешён. Multi-tile checkpoint повторяет этот барьер перед каждым readback: новый canonical enqueue между тайлами отменяет partial checkpoint; cancel и новый полный readback снова разрешены. 80 async/Room/network-snapshot tests PASS, без изменения watermark или операции.

## Отмена принятого material при history overlap

243 hardware repeat: structural Room derivation теперь совпадает у обоих authors; единственный idle blocker A — orphan reveal после отмены solver при Undo чужого layer_add. FIFO/owners/peer/rebuild queues пусты, GL0. Raw `temp/async-multiplayer/queued-log-hardware-report.json` и HOME `results-queued-log/report.json`.

Исправление не прячет partial canonical: до отмены собирает только physical targets текущего settle, async watercolor owners и принятых queued local tools, помечает их unsettled. Их open wash закрывается без land; обычный journal rebuild восстанавливает материал и штатно освобождает reveal. При context lost/destroy этот путь не запускается: restore уже владеет восстановлением. CPU проверяет started WC settle и следующий ещё не исполненный accepted WC на другом слое, unrelated layer Undo, сохранность обеих операций, eligibility rebuild и full endpoint каждого слоя vs fresh packed journal. Для CPU endpoint synchronous replay исключает неподдерживаемый MockGL intermediate mode9; actual sliced hardware endpoint впереди. Отдельный pencil cancellation тест подтверждает nonempty material при сохранённом accepted journal. 46 async/Room/context tests PASS.

## Actual Room: recovery, history fallback and stored blob (2026-10-07)

Runtime `1d6a2d3cafc5c41ef2e4d8b2fa33aa7a8b22bc57`, all 968 tracked web/shared files checked, current backend4539. Radeon hardware, physical640×480, async/source-film-rebase/Plan owner split enabled. Corrected matrix `results-cancel-recovery-history`:22 authoritative barriers,23operations per author and fresh reader, ordinary reconnect plus new participant whole canonicalRGBA exact0, nonempty, GL0 and confirmed journal preserved. This run fetched only snapshot index: it proves history fallback after snapshot-invalidation mutations, not blob restoration.

Independent `results-first-blob`: own room fBI5IEtW,2 confirmed operations, snapshot seq2, actual layer-1/2 GET200 after ordinary reconnect, whole canonicalRGBA exact0,22146 nonempty pixels, GL0. Both owned hardware Chrome runs closed in finally. Raw artifacts are under HOME680-water-wet-tone-qa/temp/async-multiplayer; full source passports and reports retained.

Performance remains open: an earlier matrix overlap gesture reached850ms active interval. An idle wet canonical comparison differs150pixels (bbox216,143–410,245, channel maxima1/2/2/1, alpha228–255 with73alpha changes). This is not classified as presentation-only or invisible-alpha noise. All ordered Dry, Undo/Redo and final reconnect endpoints remain strict exact gates.

Mid-pen CPU correction sends matching live-end once when cancelling the async non-watercolor unrecorded tail. Detach stroke identity before callback; accepted operations remain unchanged.33 async tests passed. Actual mid-pen and loss gates remain pending.

### Scoped hardware follow-up on47f1d339

`results-midpen-corrected` observed (causal cancellation proof incomplete): real normal Room pencil down/move, Undo before up; stream HpM6Z3FAVf emitted one matching live-end, accepted prior operation remained journalled; tail operation/Undo semantics were not independently classified; strict peer pixels after Undo and Redo exact0, GL0. The controller did not record active identity immediately before Undo or its return value. Therefore the observed end cannot yet be attributed to Undo; asynchronous recovery might have closed the tail earlier. A strengthened repeat is required. This is not an invented native pencil chunk. Earlier `results-midpen` stopped before drawing due missing explicit passport path; fixture error retained.

`results-loss` passed actual WEBGL_lose_context events lost→restored. First operation confirmed before loss; a second native peer operation was confirmed in the recipient journal while its real GL context was lost. Restore followed by ordered UI Dry produced exact whole640×480RGBA peer comparison, nonempty, preserved journal and GL0. This small2-operation run had zero owners before loss and does not prove carried-checkpoint or pending-command interruption. Both owned Chrome processes closed in finally. Source47f1 whole968-file passport exact, currentbackend4539.

### Actual watercolor under-pen guard and chunk preservation

`results-wc-underpen` on47f1 passed exit0/finallyClosed. Physical1800×1200, size32; ordinary native PointerInput crossed the unchanged1100px spatial threshold. Stroke rIwyLyE1jB had confirmed chunk1vfF3BF2bn before local Undo. Layer remained layer-1 and Undo returnednull under the active pen (existing guard, not cancellation). Pen-up emitted one matching live-end and recorded second chunk gqOU0Sc6Dq. Both accepted chunks survived ACK/idle; strict peer whole1800×1200RGBA after pen-up and subsequent Redo exact0/max0, GL0. No private chunk flush or changed threshold was used.

Strengthened `results-nonwc-guard` also passed: immediately before Undo, pencil stroke0LUz6cHJ-d retained matching active layer and held-preview identity, no end callback yet. Undo returnednull; ordinary up then emitted one live-end and recorded tail operation wGRYmcy5Ee. Strict peer endpoints exact0/GL0. Thus previous apparent cancellation was ordinary guarded input followed by normal pen-up; helper cancellation correctness remains a CPU/lifecycle contract, not an observed local-Undo cancellation path.

## Scoped ephemeral cancellation: CPU gate

The reachable remote-history case (`results-remote-midpen`, room AX5TWblh,
source 47f1d339) applied B's layer-add Undo while A's pencil tail was active.
A emitted one end and cancelled the unrecorded tail. B retained an ended live
claim (`paintedTotal=1`, `committedOffset=0`) awaiting an operation that would
never exist. The 120 s idle barrier failed; the owned Chrome closed. This is
separate from the guarded local Undo cases above.

The proposed optional `cancelled: true` travels through shared protocol,
server strict-boolean normalization, Room sender/receiver and Engine. It
retires only the matching author/stroke preview and its affected-layer repair
provenance. Accepted journal chunks and late confirmed operations are retained.
Normal end before ACK still waits for its confirmed operation. Recovery waits
for canonical owners, local pen and unrelated live claims, then rebuilds the
changed layer from the authoritative journal; it does not merely hide pixels.

Socket.io preserves packet/end order on each connection. A bounded 64-entry
scoped tombstone set additionally rejects delayed duplicate live packets, while
cancelled FIFO closures remain inert. Scene reset/restore clears tombstones;
clear, layer removal/replacement and completed replay retire repair flags.
Lost-context cleanup does not delete invalid GL handles.

CPU gate: 83 tests in six files passed (22.42 s), including normal end before
ACK, accepted prefix plus cancelled tail with exact MockGL endpoint, late
confirmed operation, unrelated active pen/canonical owner, lost queued preview,
strict server normalization, late packet and reset/clear/replay lifecycle.
Logs: `temp/async-multiplayer/cancel-final-lifecycle.log` and final types/lint/map
logs. This section makes no post-fix hardware or production claim; the ordinary
Room retry requires matching updated frontend and backend.

### Actual ordinary Room retry after cancellation integration

Root source `7b11b29e` was copied as all 970 tracked web/shared files into own
HOME5316 (every SHA matched). Current own backend4539 had all 131 server/shared
files exact, shared build/web types passed. No production services changed.

Two ordinary Room participants on real Radeon, physical 640×480, own room
Y3GnGVSG: B's remote Undo `V_e_Mr82te` applied while A's pencil tail
`jCFfsMOcbX` was active, canonical queue idle. A emitted exactly one matching
`cancelled:true` end; the unrecorded tail was absent from the accepted journal.
All four barriers became idle, both journals agreed, GL0/context not lost.
Recovery and subsequent Redo whole RGBA were exact (0 changed pixels, max0,
premult0), with 22,087 nonempty pixels. Accepted watercolor remained present.
Owned Chrome closed, controller exit0. This verifies reachable cancellation;
normal end before ACK and accepted-prefix cancellation remain CPU regressions.

Raw: HOME `680-water-wet-tone-qa/temp/async-multiplayer/results-remote-midpen-7b11/`;
VPS copied report `temp/async-multiplayer/remote-midpen-7b11-report.json`.
The instrumentation forwards both end arguments; earlier one-argument wrappers
would have erased the optional marker and are not used for this result.

### Open foreign-pigment dry endpoint discrepancy

A new short two-author scene on source7b11 (loaded A stroke, A clear water,
B dry pigment, then ordered UI Dry) has a strict canonical endpoint failure.
Corrected read-only captures were real (69/37 records): accepted four-op JSON
was exact, both idle/reveals empty/GL0, native and remote profile/color plus
finish bounds/radius/landedWet matched. Wet canonical export and final ordered
Dry both differed by 271 pixels/max182, alphaMax132, premultMax51.13.

An independent native repeat with material wrappers disabled also failed final
Dry (246 pixels/max255, alphaMax128, premultMax42.58). This excludes those
wrappers as a necessary trigger, but different rAF-driven gestures mean this
is not a paired fixed-input cause proof. It does not establish a regression
from 8aa or explain the earlier 150-pixel/max2 matrix discrepancy. Full staged
P/C/coverage/V comparison and historical baseline remain required. Both owned
Chrome runs closed; defaults and production were unchanged.

Raw HOME folders: `results-wet-capture-corrected-7b11`, `results-wet-clean-7b11`
under `680-water-wet-tone-qa/temp/async-multiplayer/`.
The first `results-wet-capture-7b11` is a fixture failure: wrappers were not
installed and mandatory capture correctly failed. Its raw report is retained.

### Full staged material oracle (source7b11)

Diagnostic readback preserved framebuffer binding, delegated original generators
once and kept their yields/result identity (CPU transparency check passed).
Full-tile SHA256 plus channel sums and a bounded32×32 ROI were captured before
Plan.prepare and after finish. SHA implementation matched Node crypto vectors
including4MiB; fields were processed one at a time. First attempt stopped at
497.65MiB by the unchanged500MiB guard. A later streaming-SHA run had1988MiB
preflight headroom and closed normally.

The completed run preserved the dry mismatch:199pixels/max127, alphaMax127,
premultMax18.56. Its diagnostic exit0 means records were collected, not parity
PASS. Two independent fresh remote-only engines replayed the identical four-op
tape: all six stages' full material SHA and whole RGBA were exact0.

Native/remote initial loaded stroke matched all seven source fields and all
nine available finished fields. The first divergence was the next pure-water
stroke's coverage before prepare: fullSHA differed; channel sums R/B/A agreed,
G was667122 vs648187. All P/C/V and film/dry fields still matched. On the
subsequent foreign dry-pigment stroke, P.g and coverage diverged before settle,
while P.b/P.a mass, C and V remained exact. The remote A result matched fresh
replay; native B differed. This localizes the earliest material discrepancy to
coverage/source-contact chronology; it does not yet identify an operator fix.

Prepare physical parameters bloom/water/wet/radius matched; differing request
metadata was owner capability and owned finish direction/spacing. Core material
dab fields x/y/size/angle/aspect/t matched in the earlier captured native/remote
streams. ROI does not cover the entire painted footprint; full SHA proves a
field difference, but no spatial localization outside ROI is claimed.

Raw HOME `results-material-stream-7b11/report.json`, VPS copied
`temp/async-multiplayer/material-stream-7b11-report.json`. No source/operator,
production flag or pixel tolerance changed.

### Deferred wet-profile key identity (e360f0f4)

A read-only nib-uniform capture found the pure-water source coverage discrepancy:
all sixteen native/remote mode6 nib commands had identical geometry, seed,
across/puddle/pool scalars; only paperWet differed (native0, remote13/15).
Deferred material cloned drawable Dab objects but retained wetIndex keys for the
original objects. wetOf(clone) therefore returned0. The five-line fix copies the
existing wetIndex entry to each immutable cloned dab. It changes neither water
volume nor pigment/solver operators. The regression failed before the fix and
passed after it;46 focused painter/async tests, web types and lint passed.

Post-fix hardware captured both first operations' prepare/finish fields: all
nine available full-tile SHA values, including coverage, matched native/remote.
A first endpoint attempt stopped at466.84MiB. The sequential controller initially
forgot freshEngine.setCompositeOrder: its fresh exports were transparent even
though fields matched. Those two empty PNGs' equality is invalid evidence and is
explicitly withdrawn. The corrected controller copies native composite order and
requires nonempty fresh PNGs. NativeA after the first two operations then matched
fresh2 wholeRGBA exactly0. Its final stage stopped at492.98MiB while holding two
fresh engines; final B/fresh4 was not covered. Raw failed attempts are preserved.
The final fresh-only oracle used one fresh engine at a time and the unchanged
recorded four-operation journal plus saved B-native final PNG. Both independently
replayed fresh engines had nonempty22642 alpha pixels, GL0/lostfalse and exact
operation JSON. Every available field's full SHA matched saved nativeB at all six
prepare/finish stages. B-native orderedDry versus fresh0 and fresh0 versus fresh1
wholeRGBA both matched exactly0/max0/alphaMax0. It exited0 and closed its owned
Chrome; preflight1837MiB, minimum1345MiB. The preceding nativeA2/fresh2 endpoint
also matched exactly0. This proves this four-operation scope, not arbitrary
multi-owner cancellation or device performance.

Raw HOME `results-sequential-wet-index-composite-final/report.json` retains the
partial run and A2 proof. `results-sequential-final-oracle/report.json` holds the
completed B4/fresh oracle; VPS copy is
`temp/async-multiplayer/sequential-final-oracle-report.json`. Old empty-export and
resource-aborted attempts remain distinct and are not labelled parity PASS.

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

`results-midpen-corrected` passed: real normal Room pencil down/move, Undo before up; stream HpM6Z3FAVf emitted one matching live-end, accepted prior operation remained journalled, tail had no operation; strict peer pixels after Undo and Redo exact0, GL0. This covers non-watercolor accepted previous gesture plus unrecorded current tail, not an invented native pencil chunk. Earlier `results-midpen` stopped before drawing due missing explicit passport path; fixture error retained.

`results-loss` passed actual WEBGL_lose_context events lost→restored. First operation confirmed before loss; a second native peer operation was confirmed in the recipient journal while its real GL context was lost. Restore followed by ordered UI Dry produced exact whole640×480RGBA peer comparison, nonempty, preserved journal and GL0. This small2-operation run had zero owners before loss and does not prove carried-checkpoint or pending-command interruption. Both owned Chrome processes closed in finally. Source47f1 whole968-file passport exact, currentbackend4539.

### Уточнение причинности midpen на 01:55 UTC

Предыдущий `results-midpen-corrected` сохраняет факты matching end exactly once, операции Undo и строгих конечных RGBA endpoints. Однако контроллер не записал текущие strokeLayerId/identity прямо перед Undo и returnUndo; хвост мог завершиться на более раннем RAF recovery. Причинный hardware claim «именно Undo отменил активный хвост» отозван до усиленного повторения. CPU scoped exactly-once test остаётся действительным. Для WC ordinary local Undo при активном strokeLayerId штатно возвращает null; этот UX guard не снимается ради теста.

Координатор дополнительно прочитал actual entry types прежнего midpen report: до опыта одна stroke, после опыта две stroke, ни operation_undo, ни operation_redo не записаны. Поэтому labels `midpen-undo-recovered`/`midpen-redo` сами по себе неверны как доказательство истории. Подтверждены только exactly-one stream-end и одинаковые конечные рисунки; утверждения об отменённом/незаписанном хвосте этим raw также отозваны. Усиленный контроллер обязан сохранять returnUndo, active identity до вызова и actual operation types.

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


### Pending canonical owner and remote history: deferred contract

Source970-file passport remained7b11+e360; two actual authenticated Room engines,
physical640×480 and real watercolor300 stroke. Its accepted request was pending
with one owned canonical scratch when a pencil tail began. B's Undo of its
accepted layer_add arrived while A had pending=true/owners1/active tail. The
operation stayed in _opQueue with no actual application. After the FIFO finished,
the tail remained active and Undo still waited: _scheduleOpDrain explicitly waits
for !_strokeLayerId. A controller that demanded immediate cancellation timed out;
that demand contradicted this reachable queue contract, not a proven app defect.

The corrected bounded run verified ordinary native pen-up accepted the pencil
tail and emitted exactly one normal end (cancelledfalse). Only then remote Undo
actually applied, with pendingfalse and activeNull. All accepted watercolor stroke
IDs remained; the pencil tail was recorded. Recovery and layer Redo endpoints
matched both authors' wholeRGBA exactly. After closing both author contexts, an
independent fresh replay matched final wholeRGBA/premult0, had183017 nonzero-alpha
pixels and GL0/lostfalse. The owned Chrome closed normally, exit0. This is one
canonical-owner deferred-history gate, not cancellation during pending work or a
multiple-owner PASS. Earlier canonical-idle cancelledtrue evidence stays separate.

Raw HOME `results-pending-owner-deferred-history/report.json`, VPS copy
`temp/async-multiplayer/pending-owner-deferred-history-report.json`. Previous
`results-pending-owner-cancel` timeout is retained with its limited callback
capture; no operation/model flag or pixel tolerance was changed.


### Local structural Undo cancels two queued finish requests

A separate actual Room run captured two different native finish stroke IDs and
logical gestures2/3 on one shared physical scratch. Both input finish boundaries
were recorded before any owned finish execution. At the local layer_add boundary,
there were21 retained scratch references and22 FIFO requests; the reference count
includes deposition requests, so it is not described as21 finishes or21 distinct
scratch owners. An earlier fixture's Map.size>=2 check failed fast because it
confused distinct scratch count with retained request references; no app defect
was inferred from that failure.

Ordinary local Undo targeted that just-accepted layer_add with no active pen. A
transparent delegate recorded actual _cancelSettle:20 held references→0,
pendingtrue→false, and layer-1 marked unsettled for authoritative recovery. All
three accepted watercolor operation IDs remained. Recovery and layer Redo matched
both authors' wholeRGBA/premult exactly0; both endpoints were nonempty187018 alpha
pixels. After closing both author contexts, independent fresh replay matched final
wholeRGBA0/max0/alphaMax0, nonempty187018, GL0/lostfalse. Initial pigment positive
control was nonempty22116 and peerRGBA0 before the pending workload.

This is two queued logical finish requests sharing one scratch, cancelled by
reachable local structural Undo; it does not claim two independent physical
scratch owners or undo under a native active pen. Bound360s, RAM500MiB unchanged;
exit0 and owned Chrome closed. Raw HOME
`results-multiowner-local-history-finish-proof/report.json`, VPS copy
`temp/async-multiplayer/multiowner-local-history-finish-proof-report.json`.


### Pending requests, actual context loss, arriving ACK and snapshot gate

On the same frozen970-file source, two native finish boundaries were pending.
After confirmed prefix ACK, the owner map held22 request references on one scratch.
Actual bakeNetworkSnapshot returned null while canonical pending, with dirtytrue
preserved before/after; it did not falsely acknowledge unfinished pixels.

The owned context was lost through WEBGL_lose_context. A new actual native B
stroke reached A's authoritative log, with serverSeq/ACK, while A.gl.isContextLost
was true and owners had been forgotten. Both real events were recorded (lost at
17496.8ms, restored at19810.6ms). No getError oracle was queried while lost. After
restore and ordinary UI orderedDry, both authors' wholeRGBA/premult matched0;
confirmed prefix watercolor IDs survived. Snapshot API readiness resumed with a
nonnull1228820-byte layer bake. After closing both authors, independent fresh
replay matched final wholeRGBA0/max0/alphaMax0, nonempty183297 and GL0/lostfalse.

Exit0, owned Chrome closed, bound360s/RAM500MiB unchanged. This is accepted pending
requests plus actual lost-interval arrival and snapshot readiness/resumption; it
does not claim preservation of an unrecorded tail, a carried checkpoint, uploaded
snapshot persistence or stored-blob restore. Raw HOME
`results-pending-loss-snapshot/report.json`, VPS copy
`temp/async-multiplayer/pending-loss-snapshot-report.json`.

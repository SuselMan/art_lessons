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

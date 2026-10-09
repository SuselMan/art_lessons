# DEV split-publication: минимальный ограниченный договор

Read-only proposal после understanding.yaml: операция остаётся источником правды, пиксели слоёв и async display не подменяют лог. Implementation отсутствует; defaultOFF. Actual private-copy64² proof доказывает только независимость output snapshots.

## Interface delta

1. Bridge/Executor: отдельный `submitPrivatePublication(): PublicationLease` возвращается синхронно ПОСЛЕ actual raw queue.submit. Lease имеет immutable owner/layer/generation/GLtarget/version, существующий `ack:Promise<void>`, `importAfterAck(previousCommit):Promise<void>`, `invalidate()` и bounded lifetime. Import после ACK использует private canvas, не current material. Нет нового GPU ACK/fence. Existing publish() остаётся OFF fallback.
2. Native request: optional DEV metadata distinguishes material/source; source supplies immutable scratch/tile.buffer/targetLayer/owner-generation references, checked against retained lease before execute. Missing/mismatch → обычное ожидание completion, не новый seed/ownerFor shortcut.
3. Actual FIFO: только explicit opt-in, один retained publication slot. Материал заканчивает execute generator ПОСЛЕ finish+private raw submit, но его logical completion/cancel retained. FIFO сдвигает executable head; ready()/pending учитывают retained slot. Следующий head может исполняться только если это eligible sameowner native SOURCE; не больше одного. Его source/live encode и private raw submit идут в прежнем порядке, затем SOURCE остаётся head до обоих ordered imports. Третья публикация/material/foreign/rebuild/GLconsumer не допускаются. Это осознанное изменение admission semantics, не новая очередь/lane.

Не делать generator.done равным полной логической готовности. Central.admitFactory promise, old changed(), dispose/retirement и export/drain должны сохранять прежний completion barrier после old import. Current global FIFO drain нельзя объявить ready, когда private lease pending.

## Safety invariants

- GPU command order: oldmaterial finish → private raw copy1 → nextsource/live → private raw copy2. Никакой source до rawcopy1 submission, никаких перестановок physics/Q8 passes.
- Same owner без ctor seed: scratch/tile.buffer/targetLayer/layer/generation/backend/device совпадают и live; моментные/foreign/destructive операции не подходят. Different owner ждёт old import, затем обычный GLseed.
- Commit/import order: old import1 → source import2. `previousCommit` — CPU completion ordering, не новый GPU fence; ACK2 может завершиться раньше JScallback ACK1, но import2 ждёт commit1. Ошибка commit1 запрещает commit2 и инвалидирует epoch/leases.
- Finish planner уже вызывает idempotent dispose в finally. Дополнительный central.close нельзя повторно менять nextsource scratch/meta; новый material запрещён, пока old completion pending. Global cache retirement/ownership callbacks требуют проверки actual adapter, не предположения о buffer identity.
- Cancel синхронно меняет epoch, invalidates leases и queued/retained requests, resolve ready(false), без ожидания ACK. Поздние callbacks не импортируют и не schedule новую работу. Физическое освобождение private canvas/fields идёт после своих existing ACK; retirement may await existing backend.whenIdle, как сейчас. Device loss/rejection должны попытаться cleanup всех owned ресурсов без unhandled callback.
- GL export/pencil/undo/clear/snapshot/rebuild/sync barriers считают retained completion pending. Даже sameowner shortcut запрещён, если требуется authoritative GL baseline.
- Ровно2 private contexts/leases; third candidate ждёт или отказывается без нового pool. Physical1024 memory и pool reuse ещё не измерены; source eligibility metadata не доказывает immutable physics contents вне этого ordered window.

## Meaningful actual FIFO CPU plan

Использовать actual FIFO/central/Executor; без central.isIdle override и без вызова nextsource вручную.

1. Queue material then sameowner SOURCE. Fake rawsubmit1 записывает token, ACK1 held. Pump actual FIFO: emit2 происходит строго после submit1, пока ACK1 pending; old completion/drain ещё pending.
2. Exact event/material sentinel order и nextsource metadata: finish/dispose1 → submit1 → emit2/live2/submit2; ACK2 early не вызывает import2. ACK1→import1→import2; close1 не сбрасывает source2 gesture/film/paint/delivery. OFF mode сохраняет исходный полный event trace.
3. Scratch/tile/layer/generation mismatch или nexthead material/foreign: execute2 не вызывается до commit1; новый owner seed читает только updated GL baseline.
4. Cancel/loss/rejectedACK до/после submit2: ready(false) немедленно, queued+retained cancelled exactlyonce, no late GL import/changed/schedule; физический lease не уничтожается раньше ownACK, cleanup primary error сохраняется.
5. Pending-limit/GLconsumer: третья публикация не создаётся; export/undo/clear/context-retirement не получают ready(true) до полного barrier; independent publication versions не теряют old snapshot при source writes.

Вывод: ограниченный DEV договор выглядит проверяемым без COW всех material fields, но требует изменения actual FIFO ready/cancel/admission и Bridge host API. Это архитектурная работа; отсутствие новых GPU fence не делает её автоматически безопасной. Пока HOLD, никаких runtime flags/production reorder/новых bench. Потенциальный ceiling — только publication ACK участок (~124ms конкретного прежнего run), actual gain неизвестен.

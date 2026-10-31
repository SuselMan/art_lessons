# Подготовленное room_state без включения editor

Default OFF: connectRoomSocket не принимает straight room_state без явно
инъецированного preparer. Actual Room index не передаёт preparer/source sinks;
engine/author guards и server room admission не открыты.

preflightRoomStateDelivery вызывается ДО ordered brush dispatch, setBrushRoomScope,
loadBrushLibrary, store/review mutations, refs, cursors и replay queues. Pure
prepareCanonicalRoomState требует независимо захваченные expectedBoardId и
isCurrent socket/context generation. Read epoch/profile policy берётся из того же
авторитетного room_state, не из BEGIN другого автора и не из capability payload.
Bounded profile list копируется существующим shared helper; отдельный author
profile принадлежит этому captured allow-set. Whole tail проходит существующий
shared material/attachment decoder до возврата любого atom.

Нормализованный immutable tail и preparedAtoms несёт тот же existing stash.
Лексический Symbol validator проверяет identity исходного read resource, exact
нормализованного tail array, board и lifetime. Spread с Symbols не даёт право
прикрепить другой tail. Registry/WeakMap/новой очереди нет.

restoreRoomState требует явные applyCanonicalOp/restoreCanonicalHistory sinks
ДО begin replay gate/suspend display. Canonical atoms не уходят в applyRemoteOp;
нет silent legacy fallback. После await/yield resource перепроверяется; expired
restore не публикует новые ready/cursors. Scope передаётся snapshot/backfill как
per-call аргумент, не новый retained hook state. useRemoteOperations требует
explicit canonical history sinks и использует existing snapshot/walker callbacks;
scoped backfill не падает в unscoped history repair. UI controller source sinks
и genuine generation ownership для существующего boolean ReplayGate — отдельные
remaining activation gates. Stale canonical restore не открывает чужой gate.

Проверки: existing shared codec fixture old-profile tail под новым author default,
immutable scope/material, malformed/missing capability и V1 rejection, exact
branded identity, real roomSocket wrong-cap без brushscope/load/preset/ref effects,
existing pending stash owner preservation, absent sinks before gate/display,
explicit canonical callback, stale await без apply/ready/cursor, per-call snapshot
scope/sink forwarding; legacy room socket/restore/hook regressions.

Это тестовая source/read preparation, не активный straight editor, native GUI,
realDB или device proof. Сервисы/browser/runtime/dependency copies не создавались.

Connection lifetime (2026-10-31): existing roomSocket owns a scalar generation,
not a room/epoch registry. A source preparer receives the exact connection-owned
isCurrent closure; replacing it is refused. Whole-state preflight runs before
publication or brush loading. Failed preflight leaves the previous owner current;
a successfully prepared newer state supersedes the older owner even for the same
room and numeric server epoch. Switch, rejoin/create emit, full resync, disconnect,
connect failure, kick, retry and teardown invalidate the captured owner.

The existing orderedBrushGate accepts optional lazy preset extraction and a
lifetime guard. It checks before extraction/preparation and again after awaited
preparation, dropping expired work while continuing the same queue. Legacy array
calls retain their behavior. Confirmed callbacks capture the fixed handler and
local generation at wire arrival, before any brush wait. ReplayGate-held canonical
payloads additionally carry an internal lexical proof: only the exact prepared
payload and original scope owner/current policy may release the original prepared
atom. Spread copies and replacement handlers/scopes cannot relabel stale data.

78 focused tests across six suites PASS, including failed preflight preservation,
same-epoch replacement, stale queued state with no brushscope/library effects,
wire-time confirmation capture, disconnect/switch/resync/kick invalidation,
foreign lifetime callback rejection, copied/expired/replaced replay proof and
same-owner handler rebuild. Actual editor/source activation remains OFF. No new
runtime resources, services, dependencies, browser contexts or registries created.
Combined web app + service-worker TypeScript gate: PASS
(R52/connection-read-lifetime-final-web-tsc.log). Scoped oxlint/diff check PASS.

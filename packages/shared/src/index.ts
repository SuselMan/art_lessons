// Layers

export interface RasterLayer {
  kind: 'layer'
  id: string
  name: string
  opacity: number   // 0–1
  visible: boolean
  locked?: boolean        // local guard against the user's own hand
  teacherLocked?: boolean // server rejects student operations on this layer
}

export interface LayerFolder {
  kind: 'folder'
  id: string
  name: string
  opacity: number
  visible: boolean
  collapsed: boolean
  locked?: boolean
  teacherLocked?: boolean
  children: string[]  // ordered ids, top→bottom
}

export type LayerItem = RasterLayer | LayerFolder

export interface LayerState {
  items: Record<string, LayerItem>
  rootOrder: string[]    // top→bottom; index 0 = topmost layer
  activeId: string
  selectedIds: string[]
}

export const BACKGROUND_LAYER_ID = 'background'

// Room

export type PaperType = 'rough' | 'smooth' | 'bristol'

export type CanvasSize = {
  width: number
  height: number
  label: string // 'A4' | 'A3' | 'A2' | 'Square' | '16:9' | 'Custom'
}

export type Room = {
  id: string
  name: string
  paper: PaperType
  // Infinite (tiled) canvas — see the engine's ILayerBuffer/TiledLayerBuffer.
  // canvasWidth/canvasHeight are present iff !infinite; an explicit boolean
  // discriminant rather than a sentinel width/height so every existing
  // fixed-canvas call site keeps its exact `room.canvasWidth` shape (no
  // `!== null`/`!== -1` checks needed anywhere).
  infinite: boolean
  canvasWidth?: number
  canvasHeight?: number
  hasPassword: boolean
  ownerId: string
  createdAt: string
}

// Users & roles

export type UserRole = 'FREE_TEACHER' | 'PRO_TEACHER' | 'ADMIN'
export type ParticipantRole = 'teacher' | 'student'

export type Participant = {
  userId: string
  name: string
  role: ParticipantRole
  color: string // cursor color
}

// Room color palette (#190 epic). One palette per room (not per-user, and not
// a named/multi-palette choice) — created with DEFAULT_PALETTE_COLORS when
// the room is created, added-to only for now (no per-color removal UI yet).
// Modeled as a plain hex-string array rather than a `Palette { id, name }`
// type since there is exactly one per room; a richer type can be introduced
// later if multiple/named palettes are ever needed. Lives outside the
// Operation log — it's not a drawing action and must not participate in
// undo/redo/replay — and syncs via its own socket events below instead of an
// Operation, sitting alongside `participants` in `room_state` rather than as
// a field on `Room` itself (participants isn't a `Room` field either, for the
// same reason: both are room-scoped state assembled independently of the
// Prisma `Room` row — see roomMapper.ts's `toWireRoom`).
export const DEFAULT_PALETTE_COLORS: string[] = [
  '#ffffff', '#000000', '#390099', '#9e0059', '#ff0054', '#ff5400', '#ffbd00',
]

// Operations (drawing actions — serializable, replayable).
// The room's append-only operation log is the source of truth; layer pixel
// buffers and LayerState are derived by replaying it (ADR 002).

export type ToolType = 'pencil' | 'eraser' | 'smudge'

export type Dab = {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  size: number
  aspectRatio: number
  angle: number
  // Final dab opacity, baked at record time (preset × user opacity × stroke
  // speed). Replay has no live pointer speed, so it must not recompute this.
  opacity: number
  // Milliseconds since the stroke's first dab (always 0 for that first dab).
  // Undo/redo/checkpoint replay ignore it (paints the whole array at once),
  // but a peer's live-stroke reveal (#37 follow-up v2) uses it to play the
  // recorded dabs back at the original pacing instead of all at once.
  t: number
}

type OperationBase = {
  id: string
  userId: string
  timestamp: number
  seq?: number          // total order; assigned by the server (local log until then)
}

export type StrokeOperation = OperationBase & {
  type: 'stroke'
  layerId: string
  tool: ToolType
  preset: string        // 'HB', '2B' etc — for pencil
  color: [number, number, number] // baked at record time, so replay/undo never repaints with today's live color
  dabs: Dab[]
}

/** Inserts a new raster layer at the top of rootOrder. */
export type LayerAddOperation = OperationBase & {
  type: 'layer_add'
  layerId: string
  name: string
}

/** Imports a reference image onto a layer (#88) — always targets a layer
 *  created by a `layer_add` dispatched just before it, never an existing
 *  one, so this never needs to account for content already on the layer.
 *  `image` is a data URL, embedded directly in the op rather than uploaded
 *  and referenced by URL — there's no object storage yet (#114 tracks
 *  adding one later; Postgres bytea/JSONB is the accepted MVP tradeoff for
 *  binary content, see #110). `width`/`height` are the image's own natural
 *  size, needed to fit-center it within the canvas without redecoding. */
export type ImageImportOperation = OperationBase & {
  type: 'image_import'
  layerId: string
  image: string
  width: number
  height: number
  // World-space top-left placement (infinite canvas only, #133 follow-on).
  // Omitted entirely by fixed-canvas rooms — when absent, _paintImage's
  // existing fit-center-within-the-fixed-canvas behavior is unchanged, so
  // every already-recorded op (which never had x/y) keeps replaying exactly
  // as before. Infinite-mode imports always set both.
  x?: number
  y?: number
}

/** Inserts a new empty folder at the top of rootOrder. */
export type FolderAddOperation = OperationBase & {
  type: 'folder_add'
  layerId: string
  name: string
}

export type LayerDeleteOperation = OperationBase & {
  type: 'layer_delete'
  layerIds: string[]    // targets plus their folder children, resolved at emission
}

/** Delta move: relocate one item to (parentId, index). A full-order list would
 *  let one user's later reorder silently swallow another's undo (ADR 002 §2). */
export type LayerMoveOperation = OperationBase & {
  type: 'layer_move'
  layerId: string
  parentId: string | null // folder id, or null for root
  index: number           // position within the target container, top→bottom
}

export type LayerOpacityOperation = OperationBase & {
  type: 'layer_opacity'
  layerId: string
  opacity: number       // 0–1
}

export type LayerVisibilityOperation = OperationBase & {
  type: 'layer_visibility'
  layerId: string
  visible: boolean
}

export type LayerRenameOperation = OperationBase & {
  type: 'layer_rename'
  layerId: string
  name: string
}

export type LayerClearOperation = OperationBase & {
  type: 'layer_clear'
  layerId: string
}

export type LayerMergeOperation = OperationBase & {
  type: 'layer_merge'
  layerId: string       // id of the new merged layer
  name: string
  // Bottom→top, with each source's effective opacity captured at merge time
  // so replay does not depend on later opacity changes.
  sources: Array<{ id: string; opacity: number }>
  parentId: string | null // where the merged layer lands
  index: number
}

/** Transforms (translate/scale/rotate) one or more layers' pixel content in
 *  place — one operation regardless of how many layers a gizmo moved
 *  together, so undo/redo flips them all atomically (a partial transform
 *  applied to some selected layers but not others would be a worse bug than
 *  a slightly bigger log entry — see #120 discussion). Background is never
 *  a legal target, same as other structural ops. */
export type LayerTransformOperation = OperationBase & {
  type: 'layer_transform'
  transforms: Array<{
    layerId: string
    // 2x3 affine [a, b, c, d, tx, ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty
    matrix: [number, number, number, number, number, number]
  }>
}

/** Teacher-only: marks the target operation `gone` for everyone. Not an undo —
 *  it bypasses the author's history and cannot be redone (ADR 002 §6). */
export type OperationRevokeOperation = OperationBase & {
  type: 'operation_revoke'
  targetOpId: string
}

/** A user's own undo, broadcast so every participant sees it — not just the
 *  author (#103). `targetOpId` is the specific entry to flip done → undone,
 *  decided once by the author's own client (the latest done op of theirs
 *  that isn't itself an operation_revoke/undo/redo); every replica applies
 *  the exact same id, so there's nothing to reconcile. Self-scoped like
 *  `undo`/`redo` already are: only the operation's own author's ops are
 *  ever legal targets (see `OperationLog.applyUndo`) — unlike
 *  `operation_revoke`, this is reversible via `OperationRedoOperation` and
 *  needs no teacher privilege. */
export type OperationUndoOperation = OperationBase & {
  type: 'operation_undo'
  targetOpId: string
}

/** Symmetric with `OperationUndoOperation`: flips a specific undone entry
 *  back to done. */
export type OperationRedoOperation = OperationBase & {
  type: 'operation_redo'
  targetOpId: string
}

export type Operation =
  | StrokeOperation
  | LayerAddOperation
  | ImageImportOperation
  | FolderAddOperation
  | LayerDeleteOperation
  | LayerMoveOperation
  | LayerOpacityOperation
  | LayerVisibilityOperation
  | LayerRenameOperation
  | LayerClearOperation
  | LayerMergeOperation
  | LayerTransformOperation
  | OperationRevokeOperation
  | OperationUndoOperation
  | OperationRedoOperation

/** An operation as constructed at the emission site, before identity and
 *  ordering fields are stamped on. Distributes over the union. */
export type OperationDraft = Operation extends infer O
  ? O extends Operation ? Omit<O, 'id' | 'userId' | 'timestamp' | 'seq'> : never
  : never

// Socket events

/** Result of a `create_room`/`join_room` attempt. `not_found` means no room
 *  has been registered under that id, in memory or in Postgres (#74);
 *  `wrong_password` means the room exists but the supplied password didn't
 *  match. On success, `userId` is the caller's server-resolved identity
 *  (from the identity cookie, #41) — the client uses this instead of its own
 *  ephemeral Socket.IO connection id for everything identity-shaped (stamping
 *  outgoing operations, engine.setUserId), since that id is otherwise the
 *  only stable one across reconnects. */
export type JoinResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'not_found' | 'wrong_password' }

/** Broadcast alongside the peer cursor position (#37). `drawing` tells peers
 *  to freeze the cursor dot at its last position instead of following the
 *  pointer — the actual stroke shape is unknown until the finished
 *  StrokeOperation arrives (see #37 follow-up v2: peers replay its `dabs`
 *  with original pacing rather than approximating the stroke live from
 *  partial samples, which used to visibly redraw/snap once the real
 *  Operation landed). */
export type CursorMoveData = {
  x: number
  y: number
  drawing: boolean // true while a stroke is actively in progress
}

// (#149 epic) Every SNAPSHOT_SEQ_INTERVAL operations (by the room's global,
// server-assigned seq — see Operation.seq), any client that's caught up to
// that point independently bakes and uploads a full-room pixel+layerState
// snapshot; the server just dedups by (roomId, seq), first arrival wins (see
// apps/server/src/rooms.ts's saveSnapshot). Shared so both the client
// (deciding when to bake) and the server (validating an upload actually
// lands on a real boundary) agree on the same points without coordination.
export const SNAPSHOT_SEQ_INTERVAL = 300

export type ServerToClientEvents = {
  // `latestSnapshotSeq` is null until the room has ever crossed
  // SNAPSHOT_SEQ_INTERVAL (short rooms) — `tailOperations` is then simply
  // the room's entire history, same shape/behavior as before the #149 epic.
  // Once non-null, `tailOperations` is only what's after
  // max(latestSnapshotSeq, the caller's own lastKnownSeq) — the caller is
  // expected to fetch the snapshot itself (GET /api/rooms/:id/snapshots/latest)
  // separately when it doesn't already have local state at least that fresh.
  room_state: (state: {
    room: Room; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
    palette: string[]
  }) => void
  peer_operation: (op: Operation) => void
  peer_cursor: (data: CursorMoveData & { userId: string }) => void
  peer_joined: (participant: Participant) => void
  peer_left: (userId: string) => void
  // Broadcast to every participant (including the adder) after palette_add_color
  // is accepted — see DEFAULT_PALETTE_COLORS' doc comment above for why this
  // isn't an Operation. Always the full current list, not a delta: this is a
  // handful of hex strings, not worth reconciling incrementally.
  palette_updated: (data: { palette: string[] }) => void
}

export type ClientToServerEvents = {
  /** Registers a new room and joins the calling socket as its `teacher` —
   *  the room's `ownerId` is fixed to this socket's connection, deterministic
   *  regardless of when other participants subsequently call `join_room`. */
  create_room: (
    data: {
      room: Pick<Room, 'id' | 'name' | 'paper' | 'infinite' | 'canvasWidth' | 'canvasHeight'>
      password?: string
      // Highest operation seq this socket already knows about locally (a
      // reconnecting creator whose tab never really lost its content) — lets
      // the server trim `room_state`'s tailOperations instead of resending
      // everything. Omitted (or 0) means "I have nothing," same as before.
      lastKnownSeq?: number
    },
    ack: (result: JoinResult) => void,
  ) => void
  join_room: (
    data: { roomId: string; password?: string; name: string; lastKnownSeq?: number },
    ack: (result: JoinResult) => void,
  ) => void
  // `ack`, when provided, receives the server-stamped copy (with the real,
  // authoritative `seq` — see recordOperation) right after it's recorded.
  // Only the author needs this: everyone else learns `seq` for free off the
  // `peer_operation` relay, which already carries the stamped copy. Without
  // this the author would never learn their own operation's real seq
  // (`socket.to(roomId)` deliberately excludes the sender — see
  // socketHandlers.ts), and so could never independently notice crossing a
  // SNAPSHOT_SEQ_INTERVAL boundary on their own operations.
  operation: (op: Operation, ack?: (stamped: Operation) => void) => void
  cursor_move: (data: CursorMoveData) => void
  // Appends one hex color to the room's palette (v1: add-only, no removal
  // UI yet — see DEFAULT_PALETTE_COLORS' doc comment above). Server dedups
  // and broadcasts the result via palette_updated.
  palette_add_color: (data: { color: string }) => void
}

// Hotkeys

export type HotkeyAction =
  | 'brush' | 'eraser' | 'smudge'
  | 'undo' | 'redo'
  | 'zoomIn' | 'zoomOut' | 'resetView'
  | 'layerNext' | 'layerPrev'
  | 'sizeIncrease' | 'sizeDecrease'

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  brush:        'b',
  eraser:       'e',
  smudge:       'r',
  undo:         'ctrl+z',
  redo:         'ctrl+shift+z',
  zoomIn:       '=',
  zoomOut:      '-',
  resetView:    '0',
  layerNext:    ']',
  layerPrev:    '[',
  sizeIncrease: 'shift+]',
  sizeDecrease: 'shift+[',
}

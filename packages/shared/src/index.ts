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
  canvasWidth: number
  canvasHeight: number
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

export type ServerToClientEvents = {
  room_state: (state: { room: Room; operations: Operation[]; participants: Participant[] }) => void
  peer_operation: (op: Operation) => void
  peer_cursor: (data: { userId: string; x: number; y: number }) => void
  peer_joined: (participant: Participant) => void
  peer_left: (userId: string) => void
}

export type ClientToServerEvents = {
  /** Registers a new room and joins the calling socket as its `teacher` —
   *  the room's `ownerId` is fixed to this socket's connection, deterministic
   *  regardless of when other participants subsequently call `join_room`. */
  create_room: (
    data: { room: Pick<Room, 'id' | 'name' | 'paper' | 'canvasWidth' | 'canvasHeight'>; password?: string },
    ack: (result: JoinResult) => void,
  ) => void
  join_room: (data: { roomId: string; password?: string; name: string }, ack: (result: JoinResult) => void) => void
  operation: (op: Operation) => void
  cursor_move: (data: { x: number; y: number }) => void
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

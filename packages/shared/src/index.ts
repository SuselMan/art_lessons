// Layers

export interface RasterLayer {
  kind: 'layer'
  id: string
  name: string
  opacity: number   // 0–1
  visible: boolean
  locked?: boolean     // local guard against the user's own hand
  ownerLocked?: boolean // server rejects non-owner operations on this layer
}

export interface LayerFolder {
  kind: 'folder'
  id: string
  name: string
  opacity: number
  visible: boolean
  collapsed: boolean
  locked?: boolean
  ownerLocked?: boolean
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

// The two layers every room starts with. Neither is ever produced by a
// `layer_add` operation — they are baked into the client's initial
// LayerState (see makeInitialLayerState) and therefore exist from seq 0 with
// nothing in the operation log to prove it. Anything that reconstructs "which
// layers exist" by folding over the log alone (the server's `aliveIds`
// mirror, #289) MUST seed itself from this list, or it will treat the initial
// layer as never-created and reject every delete/merge/transform touching it.
export const INITIAL_LAYER_ID = 'layer-1'
export const IMPLICIT_LAYER_IDS: readonly string[] = [BACKGROUND_LAYER_ID, INITIAL_LAYER_ID]

// Room

// Paper is one axis: how coarse the stock is. It was briefly a grid — a
// coarseness axis crossed with a "character" axis (fbm/capsules/streak) —
// back when the grain was generated procedurally and a second axis cost
// nothing but a few noise parameters (#300). Every one of those nine came
// from the same synthetic fBm, and none of them read as paper; the whole
// grid was replaced by three bakes of one photographed sheet at three
// magnifications (#333), which is what these three names now mean. A future
// second sheet is a new *stock*, not a second axis — it gets its own entry
// here, the way real paper is sold.
export const PAPER_COARSENESS = ['coarse', 'medium', 'fine'] as const
export type PaperCoarseness = typeof PAPER_COARSENESS[number]

// `flat` is deliberately not on this axis — it has no grain to be coarse or
// fine, so it is its own single type rather than three identical ones.
export type PaperGrainType = PaperCoarseness
export type PaperType = PaperGrainType | 'flat'

export const PAPER_GRAIN_TYPES: readonly PaperGrainType[] = PAPER_COARSENESS

export const PAPER_TYPES: readonly PaperType[] = [...PAPER_GRAIN_TYPES, 'flat']

/** Rooms created before the current set existed. A translation rather than a
 *  database migration: it costs a few lines, needs no downtime, and cannot
 *  half-apply. Two generations to carry now — the original three names, and
 *  the nine grid names, whose coarseness half survives verbatim (see
 *  normalizePaperType, which reads it straight off the prefix). */
const LEGACY_PAPER_TYPES: Record<string, PaperType> = {
  rough:   'coarse',
  smooth:  'medium',
  bristol: 'fine',
}

export function isPaperType(value: string): value is PaperType {
  return (PAPER_TYPES as readonly string[]).includes(value)
}

/** Accepts anything the database might hold — a current type, a legacy name,
 *  a grid name like `medium-capsules`, or a value from a newer build that
 *  this one doesn't know — and always answers with something renderable. */
export function normalizePaperType(value: string | null | undefined): PaperType {
  if (!value) return 'coarse'
  if (isPaperType(value)) return value
  if (value in LEGACY_PAPER_TYPES) return LEGACY_PAPER_TYPES[value]
  // A grid name: the character half no longer exists, but the coarseness
  // half is exactly what it always meant, so an old room keeps the grain
  // size it was drawn at.
  return paperCoarsenessOf(value) ?? 'coarse'
}

// Validates rather than casts: this is reached with whatever string the
// database holds (a legacy name, or a type from a build newer than this
// one), and silently returning an invalid key produced `undefined` lookups
// deep in the engine and the sound synth rather than an obvious failure.
// `null` means "no grain axis" — which is exactly how `flat` behaves too.
export function paperCoarsenessOf(type: string): PaperCoarseness | null {
  const head = type.split('-')[0]
  return (PAPER_COARSENESS as readonly string[]).includes(head) ? head as PaperCoarseness : null
}

// Default background color per paper texture (hex, sRGB) — the engine's
// PAPER_BLEND_FRAG uniform falls back to this when a room has no explicit
// `Room.paperColor` (rooms created before that field existed, or a creator
// who never opened the color picker). Lives here rather than only in
// engine/index.ts so CreateRoom's paper-color picker can default/preview
// against the exact same values the engine will actually render.
// (#300) Keyed by coarseness rather than by full type: the default tint
// tracks how coarse the stock is (coarser paper reads warmer and slightly
// darker), which has nothing to do with its fibre character. These are the
// same three values the old rough/smooth/bristol carried.
const DEFAULT_PAPER_COLOR_BY_COARSENESS: Record<PaperCoarseness, string> = {
  coarse: '#f5f0e6',
  medium: '#f7f7f5',
  fine:   '#fcfcfa',
}

export function defaultPaperColor(type: PaperType): string {
  const coarseness = paperCoarsenessOf(type)
  // Flat has no grain at all, so it gets the cleanest of the three.
  return coarseness ? DEFAULT_PAPER_COLOR_BY_COARSENESS[coarseness] : '#fcfcfa'
}

export const DEFAULT_PAPER_COLORS: Record<PaperType, string> =
  Object.fromEntries(PAPER_TYPES.map(t => [t, defaultPaperColor(t)])) as Record<PaperType, string>

// Shown in the paper picker.
export const PAPER_COARSENESS_LABELS: Record<PaperCoarseness, string> = {
  coarse: 'Coarse',
  medium: 'Medium',
  fine:   'Fine',
}

export function paperTypeLabel(type: PaperType): string {
  if (type === 'flat') return 'Flat'
  return PAPER_COARSENESS_LABELS[type]
}

export type CanvasSize = {
  width: number
  height: number
  label: string // 'A4' | 'A3' | 'A2' | 'Square' | '16:9' | 'Custom'
}

// (#224, release track #314 §6) Who is allowed into a room at all.
//
// `anyone_with_link` is what every room did before this existed and stays the
// default: the id in the URL is the credential. `invite_only` admits the
// owner, anyone on the room's email allow-list, and anyone the owner has
// approved from the waiting queue; everyone else can ask, and waits.
//
// Orthogonal to `hasPassword` — see the accessMode comment in schema.prisma
// for why the two are separate toggles rather than one setting.
export type RoomAccessMode = 'anyone_with_link' | 'invite_only'

export type Room = {
  id: string
  name: string
  paper: PaperType
  // Hex color (sRGB, e.g. "#f5f0e6") the creator picked for the paper
  // background, decided once at creation alongside `paper` itself — never
  // changed after (same "fixed after creation" rule the CreateRoom UI
  // states for `paper`). Absent on rooms created before this field existed;
  // renderers fall back to DEFAULT_PAPER_COLORS[paper] in that case (see
  // engine/index.ts's PAPER_COLORS usage) rather than treating it as
  // required everywhere.
  paperColor?: string
  // Infinite (tiled) canvas — see the engine's ILayerBuffer/TiledLayerBuffer.
  // canvasWidth/canvasHeight are present iff !infinite; an explicit boolean
  // discriminant rather than a sentinel width/height so every existing
  // fixed-canvas call site keeps its exact `room.canvasWidth` shape (no
  // `!== null`/`!== -1` checks needed anywhere).
  infinite: boolean
  canvasWidth?: number
  canvasHeight?: number
  hasPassword: boolean
  // (#224) Required rather than optional, unlike the other fields added to
  // this type after the fact: the column is NOT NULL with a default, so every
  // room — including every one that predates the column — has a real value,
  // and an optional field would invite `?? 'anyone_with_link'` fallbacks at
  // each call site, i.e. a second place where the default lives and can drift
  // from the schema's.
  accessMode: RoomAccessMode
  ownerId: string
  // Owner's display name, joined in server-side (User.name is nullable —
  // guest/anonymous accounts, see schema.prisma's User comment — so this is
  // too). Only populated by list-style endpoints (e.g. GET /api/rooms/mine)
  // that explicitly include it; absent elsewhere (e.g. the in-memory room
  // state built by rooms.ts's cold-load path).
  ownerName?: string
  createdAt: string
  // #146: set once a client has uploaded a composite-PNG preview of the
  // room's content (RoomThumbnail table) — absent until the first upload.
  // Client-only cache-busting key for `<img src="/api/rooms/:id/thumbnail">`;
  // the bytes themselves are fetched separately, never inlined here.
  thumbnailUpdatedAt?: string
  // (#211 epic) This room's folder placement for the *current* caller —
  // folders are per-user organization (RoomParticipant.folderId), not a
  // property of the room itself, so this reflects the caller's own filing,
  // not a global fact about the room. Absent/undefined = root level.
  folderId?: string
  // (#222) Set while the room is closed for editing — the state the homework
  // model's source lesson sits in (release track #314 §4), and what makes a
  // template trustworthy: a fork can only be a faithful copy if its source
  // cannot drift after the copy was taken.
  //
  // Unlike the room/participant freeze (#256/#257), which is a live
  // classroom control held in memory and lost on restart, this is a property
  // of the document and is persisted. It is also stricter: freeze exempts the
  // owner, closing does not — see getOperationRejectReason in rooms.ts.
  //
  // A timestamp rather than a boolean because the column already existed as
  // one (schema.prisma) and "when was this handed out" is worth more later
  // than the bit alone. Absent = open.
  closedAt?: string
  // (#317) The room this one was forked from — the homework model's whole
  // lineage record (see §4 of the release track #314: a lesson is closed for
  // editing and each student forks it). Absent on rooms created from
  // scratch. Deliberately survives the parent's deletion as `undefined`
  // rather than taking the fork with it: a student's own work must not
  // disappear because the teacher tidied up their side.
  parentRoomId?: string
}

// (#226) Everything the access panel (#228) shows about one room, fetched in
// one request so the component has no partially-populated state to render.
// Owner-only, both because it is the owner's own control surface and because
// of what it lists: an allow-list of addresses, and who asked to get in.

/** One entry of an `invite_only` room's allow-list. The address is stored
 *  lowercased/trimmed (see roomAccess.ts) — this is the normalized form, which
 *  is also the one to send back to `DELETE /invites/:email`. */
export type RoomInvite = {
  email: string
  invitedAt: string
}

/** Someone waiting for the owner to let them in. `email` is included — unlike
 *  on `RoomAccessParticipant` below — because this person is actively asking
 *  the owner for a decision, and the address they are asking with is the
 *  minimum needed to make it a real one rather than a coin flip on a display
 *  name. Only reachable by someone signed in (a guest gets `login_required`),
 *  so it is never null in practice; typed nullable because `User.email` is. */
export type RoomJoinRequest = {
  id: string
  userId: string
  name: string
  email: string | null
  requestedAt: string
}

/** Someone who has ever been in the room (`RoomParticipant`), with whether
 *  they are currently blocked from coming back.
 *
 *  Deliberately carries no email. These people didn't ask the owner for
 *  anything — they were let in, or came through a link — and the owner's use
 *  for this list is "who is in my lesson, and remove that one", which a name
 *  serves. Handing every room owner the addresses of everyone who ever opened
 *  their link is a disclosure with no matching need. */
export type RoomAccessParticipant = {
  userId: string
  name: string | null
  blocked: boolean
}

export type RoomAccessInfo = {
  accessMode: RoomAccessMode
  hasPassword: boolean
  invites: RoomInvite[]
  pendingRequests: RoomJoinRequest[]
  participants: RoomAccessParticipant[]
}

// (#317) Author stamped on the operations a fork inherits from its source.
//
// Undo is personal — the engine's OperationLog only ever offers a user their
// *own* operations, and refuses to apply an undo whose target someone else
// authored. Re-stamping the inherited log with an id no live participant can
// ever hold therefore makes the seeded content unundoable for everyone,
// without a new column or a new rule anywhere in the undo path.
//
// The case this exists for is not the student: their own id already fails
// that check against the teacher's operations. It's the *teacher* opening a
// student's fork to mark it (#87) — every seeded operation is theirs, so
// their first Ctrl+Z, before they have corrected anything, would start
// dismantling the assignment itself.
//
// The trade: authorship inside the seeded region is not recoverable
// afterwards. For homework that reads as a feature — "this part is the
// assignment, that part is the student's" — but it is one-way.
export const FORK_SEED_USER_PREFIX = 'seed:'

export function forkSeedUserId(roomId: string): string {
  return `${FORK_SEED_USER_PREFIX}${roomId}`
}

export function isForkSeedUser(userId: string): boolean {
  return userId.startsWith(FORK_SEED_USER_PREFIX)
}

// (#211 epic) Per-user room-list folder. Nesting via `parentFolderId`
// (null = root level); see issue #212 for the cycle-guard/empty-only-delete
// rules enforced server-side. Purely organizational metadata — deleting a
// folder never deletes the rooms filed in it (see Room.folderId above).
export type RoomFolder = {
  id: string
  userId: string
  name: string
  parentFolderId: string | null
  createdAt: string
}

// Users & roles

export type UserRole = 'FREE' | 'PRO' | 'ADMIN'
export type ParticipantRole = 'owner' | 'member'

export type Participant = {
  userId: string
  name: string
  role: ParticipantRole
  color: string // cursor color
  // (#254 epic) Owner-triggered runtime privilege, computed server-side same
  // as `role` — never persisted, reset whenever the in-memory room record
  // itself is (server restart / room evicted then reloaded). The room's
  // owner can never be frozen (see rooms.ts's setParticipantFrozen).
  frozen: boolean
}

// Room color palette (#190 epic). One palette per room (not per-user, and not
// a named/multi-palette choice) — created with DEFAULT_PALETTE_COLORS when
// the room is created; any participant can add the currently selected color
// or remove one already in the palette (toggle, not a delete-only UI).
// Modeled as a plain hex-string array rather than a `Palette { id, name }`
// type since there is exactly one per room; a richer type can be introduced
// later if multiple/named palettes are ever needed. Lives outside the
// Operation log — it's not a drawing action and must not participate in
// undo/redo/replay — and syncs via its own socket events below instead of an
// Operation, sitting alongside `participants` in `room_state` rather than as
// a field on `Room` itself (participants isn't a `Room` field either, for the
// same reason: both are room-scoped state assembled independently of the
// Prisma `Room` row — see roomMapper.ts's `toWireRoom`).
// First entry is the pencil's own default graphite color (engine's
// DEFAULT_GRAPHITE_COLOR, [0.14, 0.14, 0.17] converted via rgbToHex) —
// duplicated as a literal rather than imported since `packages/shared` sits
// below `apps/web/engine` in the dependency graph; keep the two in sync by
// hand if the engine's default ever changes.
export const DEFAULT_PALETTE_COLORS: string[] = [
  '#24242b', '#ffffff', '#000000', '#390099', '#9e0059', '#ff0054', '#ff5400', '#ffbd00',
  '#ddf21f', '#00f3ff',
]

// Operations (drawing actions — serializable, replayable).
// The room's append-only operation log is the source of truth; layer pixel
// buffers and LayerState are derived by replaying it (ADR 002).

export type ToolType = 'pencil' | 'eraser' | 'smudge' | 'liner' | 'marker' | 'charcoal'

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
  // 'HB'/'2B' etc for pencil, the liner's own size label, `${nib}:${size}`
  // for marker, 'vine'/'willow'/'compressed' for charcoal (ADR 005 §1 — the
  // three charcoal types ride this existing field rather than needing one of
  // their own, exactly as pencil's hardness grades already do).
  preset: string
  color: [number, number, number] // baked at record time, so replay/undo never repaints with today's live color
  // (#366) Exactly one of these two carries the stroke's dabs — read them
  // through `strokeDabs(op)` rather than either field directly.
  //
  // `dabsPacked` is what every newly recorded stroke uses (see packDabs for
  // why: a dab is ~250 bytes as JSON and ~53 packed, and the count scales
  // with a stroke's *world* length, so low zoom makes single strokes
  // megabytes). `dabs` is the original plain form, kept because the
  // Operation Log is permanent — every stroke recorded before this existed
  // is still in Postgres and in every room's history, and must keep
  // replaying. Neither field is going away; this is a format that gained a
  // second encoding, not one that migrated.
  dabs?: Dab[]
  dabsPacked?: string
  // Smudge only (#14): this user's own carried-graphite reservoir level
  // (0..1) immediately before/after this op's own dabs, baked at record
  // time for the same reason `color` is — replay/a remote client applying
  // this op must reproduce the exact same pickup/deposit amounts the
  // originating client's engine computed, and that depends on reservoir
  // state that lives *outside* any single dab (see engine/index.ts's
  // _smudgeUserLoad). Absent for every other tool, and for legacy strokes
  // recorded before this field existed (treated as 0 — an empty reservoir,
  // the same default a brand-new user's tool would have).
  smudgeLoadAtStart?: number
  smudgeLoadAtEnd?: number
  /** Which gesture this operation belongs to. A stroke longer than
   *  STROKE_DAB_CHUNK_LIMIT dabs is recorded as several operations (see the
   *  engine's _flushStrokeChunk and that constant's own comment for why the
   *  log can't hold one unbounded op); every chunk of one pen-down-to-pen-up
   *  gesture carries the same value here, and a stroke short enough to fit in
   *  one op carries it too.
   *
   *  Needed because a marker stroke is not the sum of its dabs: it composites
   *  by multiplying the layer's *pre-stroke* content, frozen once per gesture
   *  (see MarkerStrokeScratch). Replay a gesture's chunks as unrelated
   *  operations and the second one multiplies over the first one's output
   *  instead — a nib-shaped dark band across the stroke at every boundary,
   *  which is what a long marker line looked like after an undo.
   *
   *  Absent on strokes recorded before this existed; they replay as they
   *  always did, each chunk standing alone. */
  strokeId?: string
}

/** Inserts a new raster layer directly above whichever layer its author had
 *  selected (#378) — the same `(parentId, index)` delta `layer_move` uses, and
 *  for the same reason it is carried in the operation rather than derived:
 *  `activeId` is per-user view state that never enters the log, so replay on
 *  anyone else's client has nothing to work out a position from. Resolving it
 *  at emission is also what makes concurrent adds behave, exactly like
 *  `layer_delete` resolving folder children up front.
 *
 *  Both fields optional, and absent means "top of rootOrder": that is where
 *  every layer went before this existed, so operations already in the log
 *  replay unchanged. */
export type LayerAddOperation = OperationBase & {
  type: 'layer_add'
  layerId: string
  name: string
  parentId?: string | null // folder id, or null/absent for root
  index?: number           // position within the target container, top→bottom
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

/** Inserts a new empty folder above the active item's own row (#378), by the
 *  same rule and for the same reasons as `LayerAddOperation` above. No
 *  `parentId` counterpart: folders are one level only, so a folder's position
 *  is always an index into `rootOrder`. Absent `index` means the top. */
export type FolderAddOperation = OperationBase & {
  type: 'folder_add'
  layerId: string
  name: string
  index?: number
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

/** Owner-only (#254/#258): reserves (or releases) a layer for the room
 *  owner — the server rejects `stroke`/other layerId-bearing operations
 *  targeting a `locked: true` layer from anyone but the owner. Goes through
 *  the normal Operation Log/replay path like `layer_visibility`/
 *  `layer_opacity` (so every participant's `RasterLayer.ownerLocked`/
 *  `LayerFolder.ownerLocked` stays in sync via applyContentOp), but is also
 *  the one operation type the server itself inspects the content of — see
 *  rooms.ts's `lockedLayerIds` tracking and its own doc comment for why
 *  that's a deliberate, narrow exception to "server never renders/parses
 *  operation content" (CLAUDE.md). */
export type LayerOwnerLockOperation = OperationBase & {
  type: 'layer_owner_lock'
  layerId: string
  locked: boolean
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
 *  needs no owner privilege. */
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
  | LayerOwnerLockOperation
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
/** (#225) Every way a join can fail to seat someone. Three of these are not
 *  really failures of the request but states of the *person* asking, which is
 *  why they are worth distinguishing in the wire contract rather than
 *  collapsing into one refusal — the join screen renders a different thing for
 *  each (#231):
 *
 *  - `access_revoked` — the owner blocked this user from this room. Terminal:
 *    nothing the client can do changes it.
 *  - `login_required` — an `invite_only` room's allow-list is keyed by email,
 *    and this browser is an anonymous guest with none. Signing in is the one
 *    move that can change the answer.
 *  - `pending_approval` — the request has been recorded and is waiting for the
 *    owner. The only one of these that resolves on its own, by someone else's
 *    action.
 *
 *  Deliberately no `access_denied`: a denied request reopens as pending on the
 *  next attempt (see roomAccess.ts), so "denied" is never a state the joiner
 *  sits in and never a thing the client has to render. */
export type JoinDenial =
  | 'not_found'
  | 'wrong_password'
  | 'access_revoked'
  | 'login_required'
  | 'pending_approval'

export type JoinResult =
  | { ok: true; userId: string }
  | { ok: false; error: JoinDenial }

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
//
// This bounds *operation count*, not bytes — a fine proxy when most ops are
// small, but a room with few, huge strokes (a long fill/scribble — see
// engine/index.ts's STROKE_DAB_CHUNK_LIMIT) can carry tens of MB in far
// fewer than 300 ops, never crossing even one checkpoint and paying full-
// history replay on every join no matter how big it gets (a real, observed
// case: a room's own load hanging for minutes on 25MB of history in just
// 117 ops). Lowered from 300 to 100 so heavy-content rooms hit a checkpoint
// much sooner; still coarse for a genuinely pathological room, which is why
// Room/index.tsx's handleRoomState now also bakes once, retroactively, the
// first time any client fully catches up a room that has never had a
// snapshot at all — see its own comment.
export const SNAPSHOT_SEQ_INTERVAL = 100

// Result of sending one `Operation` to the server (#289 epic — reliable
// history spec v0.2). Replaces the old "ack always receives the stamped
// copy" contract: every operation now gets an explicit verdict, including
// ones previously rejected in total silence (room/participant freeze,
// owner-lock — see isOperationAllowed in rooms.ts, which used to just
// `return` with no ack at all, indistinguishable from a dropped packet).
// `duplicate: true` on an `ok` result means this exact `Operation.id` had
// already been recorded (see rooms.ts's dedup) — the sender's own retry
// raced its earlier attempt's ack, not a new operation.
export type SendResult =
  | { ok: true; seq: number; duplicate?: boolean }
  | { ok: false; reason: RejectReason }

export type RejectReason =
  | 'room_frozen' | 'participant_frozen' | 'layer_owner_locked' | 'not_owner'
  // (#222) The room is closed for editing (Room.closedAt). Distinct from
  // `room_frozen` on purpose, even though both mean "nobody may draw right
  // now": freeze is a live control the owner is holding down during a lesson,
  // closing is a state the lesson is in — different UI, different wording,
  // and only one of them survives a server restart.
  | 'room_closed'
  // The operation references a layerId/folderId no longer in the room's
  // alive set (deleted or consumed by a merge) — see rooms.ts's aliveIds.
  | 'target_gone'
  // (#298) This socket has not completed create_room/join_room, so the
  // server has no room to record against. Unlike every other reason here it
  // is *transient* — the client simply sent too early — so the client
  // retries rather than discarding the operation. It exists at all because
  // the server used to `return` with no ack in this case, which is
  // indistinguishable from a dropped packet: the sender waited out its
  // timeout and retried forever. See socketHandlers.ts's 'operation' handler.
  | 'not_joined'

export type ServerToClientEvents = {
  // `latestSnapshotSeq` is null until anyone has stored a snapshot for this
  // room (short rooms) — `tailOperations` is then simply the room's entire
  // history, same shape/behavior as before the #149 epic. Once non-null the
  // caller is expected to fetch the stored snapshots itself
  // (GET /api/rooms/:id/snapshots/latest); the seq is the structure's own,
  // and is what a history backfill anchors on.
  //
  // (#372) What `tailOperations` leaves out is decided per layer, against each
  // layer's own stored coverage, not by one room-wide seq. A room-wide floor
  // is what lost drawing in #369: a layer missing from a snapshot had no
  // pixels *and* was refused the operations that would have rebuilt it.
  //
  // Only *pure* pixel operations are ever omitted (stroke/image_import/
  // layer_clear on a layer covered at or past their seq) — the heavy ones,
  // where all the saving is. Operations carrying pixels *and* something else
  // — `layer_merge` (also structure) and `layer_transform` (several layers at
  // once) — always arrive, because the client needs their other half, and it
  // skips their pixel effect itself against the coverage it actually restored
  // (#374). That coverage travels with the snapshots themselves, per layer, so
  // nothing about it needs saying here: deciding it from what this client
  // really has is what makes a snapshot landing mid-join harmless rather than
  // a double-paint.
  room_state: (state: {
    room: Room; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
    palette: string[]
    // (#254/#255 epic) Room-wide freeze, live in-memory only (never
    // persisted — see rooms.ts's RoomRecord.roomFrozen) — included in the
    // join/reconnect snapshot so a reconnecting client sees the current
    // status immediately, same reasoning as `participants`/`palette` above.
    frozen: boolean
  }) => void
  // The single channel that drives painting into every client's confirmed
  // buffer — including the author's own (unlike the old `peer_operation`,
  // which `socket.to()` deliberately excluded the sender from). Broadcast
  // via `io.to(roomId)`, one emit per accepted operation, in the exact
  // order the server accepted them — WebSocket/TCP guarantees a single
  // connection never reorders its own message stream, so this is already a
  // strictly seq-ordered feed with no separate reorder buffer needed on the
  // client (reliable history spec v0.2, §11). `seq` is carried at the top
  // level (not just inside `operation`, where it's optional until stamped)
  // so logging/replay/gap-detection never has to reach into the union.
  operation_confirmed: (msg: { seq: number; operation: Operation }) => void
  peer_cursor: (data: CursorMoveData & { userId: string }) => void
  peer_joined: (participant: Participant) => void
  peer_left: (userId: string) => void
  // Broadcast to every participant (including the one who triggered it) after
  // palette_add_color/palette_remove_color is accepted — see
  // DEFAULT_PALETTE_COLORS' doc comment above for why this isn't an
  // Operation. Always the full current list, not a delta: this is a handful
  // of hex strings, not worth reconciling incrementally.
  palette_updated: (data: { palette: string[] }) => void
  // (#254/#256 epic) Broadcast to the whole room (including the owner who
  // triggered it, same `io.to` reasoning as palette_updated above) whenever
  // `set_room_frozen` is accepted.
  room_frozen_changed: (data: { frozen: boolean }) => void
  // (#254/#257 epic) Broadcast to the whole room whenever `set_participant_frozen`
  // is accepted — every participant needs this, not just the target, so
  // ParticipantsPanel can show the frozen indicator for everyone else too.
  participant_frozen_changed: (data: { userId: string; frozen: boolean }) => void
  // (#222) Broadcast to everyone in the room when its closed-for-editing
  // state is toggled. The toggle itself is REST, not a socket event (see
  // roomRoutes.ts): it is owner-only, persisted, and reachable from the
  // lesson list where there is no socket for that room at all. This event
  // exists so people already *inside* the room find out at the moment it
  // happens rather than on the rejection of their next stroke.
  // ISO timestamp while closed, null once reopened — the same shape the
  // wire `Room.closedAt` carries.
  room_closed_changed: (data: { closedAt: string | null }) => void
  // (#227) The three live halves of access control. Everything durable about
  // it is REST (#226) and every decision is re-made from Postgres on the next
  // join (#225) — these exist so nobody has to reload a page to find out
  // something already happened to them.
  //
  // Unlike every event above, these are addressed to a *person*, not to a
  // room: the owner may be looking at their lesson list rather than sitting in
  // the room, and someone waiting for approval was refused entry and is in no
  // socket.io room at all. Each socket therefore also joins a channel of its
  // own userId (see socketHandlers.ts's userChannel), and these are emitted
  // there — which also means every tab that person has open hears it.

  // Sent to the room's owner when someone asks to be let in. Carries the
  // request itself so the panel can render the new row without refetching;
  // `roomId` because an owner with several lessons open needs to know which.
  join_request_created: (data: { roomId: string; request: RoomJoinRequest }) => void
  // Sent to the asker once the owner decides — including when the decision was
  // made implicitly, by inviting the address they were queued under. On
  // `approved` the client finishes the join it was refused (it re-emits
  // `join_room`); the server holds nothing open in the meantime, so a client
  // that missed this event while offline simply gets in on its next attempt.
  join_request_resolved: (data: { roomId: string; approved: boolean }) => void
  // Sent to someone being removed from a room they are currently in, right
  // before the server takes them out of it. Not a disconnect: their connection
  // stays up so the client can navigate away (and keep working elsewhere)
  // rather than reconnect into a room it is no longer in.
  kicked: (data: { roomId: string }) => void
}

export type ClientToServerEvents = {
  /** Registers a new room and joins the calling socket as its `owner` —
   *  the room's `ownerId` is fixed to this socket's connection, deterministic
   *  regardless of when other participants subsequently call `join_room`. */
  create_room: (
    data: {
      room: Pick<Room, 'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight'>
      password?: string
      // (#328) The creator's own display name, same field `join_room` has
      // always carried. Before this the server labelled every room owner
      // "Teacher" because this payload had nowhere to put a name — which then
      // showed up verbatim in the participants list, next to everyone else's
      // real name, and flipped to their actual name the moment they reloaded
      // (a reload rejoins through `join_room`, which does carry one).
      name: string
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
  // `ack`, when provided, receives an explicit `SendResult` — accepted
  // (with the real, authoritative `seq`) or rejected (with a reason), never
  // silence. This is bookkeeping only (outbox retry/rollback decisions,
  // local "pending" UI) — it is never what paints an operation into the
  // confirmed buffer; that's `operation_confirmed` alone, which now reaches
  // the author too (reliable history spec v0.2, §7/§9).
  operation: (op: Operation, ack?: (result: SendResult) => void) => void
  cursor_move: (data: CursorMoveData) => void
  // Appends one hex color to the room's palette (see DEFAULT_PALETTE_COLORS'
  // doc comment above). Server dedups and broadcasts the result via
  // palette_updated.
  palette_add_color: (data: { color: string }) => void
  // Removes one hex color from the room's palette. A no-op (still broadcasts
  // the unchanged palette) if the color isn't present.
  palette_remove_color: (data: { color: string }) => void
  // (#254/#256 epic) Owner-only — server verifies `role` itself via
  // getParticipant, never trusts the client (same pattern as
  // `operation_revoke`'s existing role check in socketHandlers.ts). Freezes
  // (or unfreezes) every non-owner participant's operations at once.
  set_room_frozen: (frozen: boolean) => void
  // (#254/#257 epic) Owner-only, same role-check pattern as `set_room_frozen`.
  // Targets one participant without touching the room-wide freeze — the two
  // are independent and can both be active at once. A no-op if `userId` is
  // the room's own owner (see rooms.ts's setParticipantFrozen).
  set_participant_frozen: (data: { userId: string; frozen: boolean }) => void
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

// (#366) Stroke dab encoding — see dabCodec.ts.
export { DAB_PACK_VERSION, packDabs, unpackDabs } from './dabCodec.js'
import { unpackDabs as unpackDabsImpl } from './dabCodec.js'

/** The dabs of a stroke operation, whichever way it happens to carry them.
 *  Every consumer must go through this rather than reading `dabs` or
 *  `dabsPacked` — an operation from before #366 has only the former and one
 *  recorded since has only the latter, and both replay forever.
 *
 *  Decodes on each call rather than caching: replay paints an operation's
 *  dabs once and moves on, and the one caller that reads the same operation
 *  repeatedly (a peer's live-stroke reveal, which walks the array as time
 *  passes) holds its own reference to the result. */
export function strokeDabs(op: StrokeOperation): Dab[] {
  if (op.dabs) return op.dabs
  return op.dabsPacked ? unpackDabsImpl(op.dabsPacked) : []
}

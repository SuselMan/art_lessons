// Layers

export interface RasterLayer {
  kind: 'layer'
  id: string
  name: string
  opacity: number   // 0–1
  visible: boolean
  // (#488) Two locks, and the asymmetry between them is the point:
  //   `locked`      — a shared guard against anyone's hand, the owner's
  //                   included. Anyone may set it and anyone may take it off.
  //   `ownerLocked` — the room owner reserving a layer: it stops everyone
  //                   *but* the owner, and only the owner can release it.
  // Both travel in the log (`layer_lock` / `layer_owner_lock`). `locked` used
  // to be per-user view state that never became an operation, which made it
  // behave backwards — it did not survive its own author's reload, and it did
  // reach everyone else through the snapshot's layerState.
  locked?: boolean
  ownerLocked?: boolean
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

/**
 * The layers an operation applies to, in one shape whichever form it was
 * recorded in (#412).
 *
 * `layer_opacity` and `layer_visibility` used to name a single `layerId` and
 * now carry a `layerIds` list. Both forms are permanently valid to *read*:
 * the singular one is written into the operation logs of every room created
 * before #412, and those logs are replayed verbatim on every join. Only the
 * plural form is ever written from here on.
 *
 * Every reader goes through this. A `op.layerId` left somewhere would work
 * perfectly against old rooms and silently ignore every mass change made in
 * new ones — the kind of failure that shows up as "sometimes it doesn't
 * apply" months later.
 */
export function operationLayerIds(op: { layerId?: string; layerIds?: string[] }): string[] {
  if (op.layerIds) return op.layerIds
  return op.layerId === undefined ? [] : [op.layerId]
}

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
// (#426) Lifted towards white and roughly halved in warmth. The old values
// were picked while the app only had a dark theme, and against near-black they
// read as neutral stock; with a light interface around them the same warmth
// reads as yellow, which is simultaneous contrast doing what it does — the
// paper never changed, its surround did. Since the light theme is now a first
// class option, the tint is set so the stock reads as paper in both surrounds
// rather than as neutral in one and yellow in the other.
// The ramp itself is unchanged in shape and has to stay that way: coarser
// stock is warmer *and* slightly darker than finer stock. Moving one of these
// three without the others inverts that ordering.
const DEFAULT_PAPER_COLOR_BY_COARSENESS: Record<PaperCoarseness, string> = {
  coarse: '#faf8f4',
  medium: '#fcfbf9',
  fine:   '#fdfdfc',
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

export const ROOM_ACCESS_MODES: readonly RoomAccessMode[] = ['anyone_with_link', 'invite_only']

/** (#232) The wire type is a compile-time promise, and a socket payload is
 *  not compiled by us — this is what stands between a hand-crafted
 *  `accessMode: "public"` and a Postgres enum that cannot hold it. Without
 *  it that write fails, and since room creation is persisted fire-and-forget
 *  (rooms.ts), the room would exist in memory with no row behind it. */
export function isRoomAccessMode(value: unknown): value is RoomAccessMode {
  return typeof value === 'string' && (ROOM_ACCESS_MODES as readonly string[]).includes(value)
}

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

export type ToolType =
  | 'pencil' | 'eraser' | 'smudge' | 'liner' | 'marker' | 'charcoal' | 'brushPen'
  // #468, ADR 011 — an experiment, and deliberately not in docs/TOOLSET.md
  // until it earns a place there. Sits in the union rather than behind a flag
  // because the Operation Log is permanent: the moment one watercolor stroke
  // is recorded in a real room, every client must keep replaying it forever,
  // so the wire type has to know the tool from the first stroke onward.
  | 'watercolor'

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
  // Smudge only (#14), legacy since #416 — neither written nor read by the
  // engine anymore, kept because the Operation Log is permanent and rooms in
  // production hold strokes carrying them.
  //
  // They recorded this user's own carried-graphite level (0..1) immediately
  // before/after the op's dabs. That was needed while the smudge tool
  // carried a single scalar that persisted across strokes: replay had to
  // reproduce pickup/deposit amounts that depended on state living *outside*
  // any single dab, so each op had to state it. #416 replaced the scalar
  // with a raster imprint that resets at every gesture (see
  // engine/index.ts's _smudgeImprints) — a smudge operation reproduces from
  // its own dabs alone again, and there is nothing left for these to carry.
  // A stroke recorded with them simply replays under the new model, ignoring
  // them.
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
  /** (#468 v7) Which *wash* this stroke belongs to — watercolor only.
   *
   *  A wash is several strokes laid in quick succession with the same paint on
   *  the same layer, and the point of grouping them is that they must not
   *  behave like separate marks laid on top of one another. Real paint does not
   *  work that way: lay a second band beside a wet first one and the two become
   *  one pool, the boundary between them disappears, and only the outer
   *  perimeter of the whole thing gets a tideline. Without this, a flat wash —
   *  the very first exercise anyone is set — is impossible to paint, because
   *  every band arrives with its own edge, its own pooling and its own dried
   *  rim.
   *
   *  Decided live and *recorded*, exactly as `strokeId` is, and for the same
   *  reason: the grouping rule wants wall-clock timing, which replay must never
   *  have. Writing down the answer keeps replay a pure function of the log
   *  while letting the decision use whatever the live client knows.
   *
   *  Absent on every stroke of every other tool, and on watercolor strokes
   *  recorded before this existed — those replay exactly as they always did,
   *  each standing alone. */
  washId?: string
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
 *  same rule and for the same reasons as `LayerAddOperation` above.
 *
 *  (#410) `parentId` is the counterpart this used to lack on purpose, back
 *  when folders were one level deep and a folder's position could only ever be
 *  an index into `rootOrder`. Folders nest now, so a folder is placed by the
 *  same (container, index) pair as anything else. Absent or null means root —
 *  which is where every folder went before nesting existed, so `folder_add`
 *  operations already in the log replay exactly as they did. Absent `index`
 *  means the top. */
export type FolderAddOperation = OperationBase & {
  type: 'folder_add'
  layerId: string
  name: string
  parentId?: string | null // folder id, or null/absent for root
  index?: number
}

export type LayerDeleteOperation = OperationBase & {
  type: 'layer_delete'
  layerIds: string[]    // targets plus their folder children, resolved at emission
}

/** Delta move: relocate one item to (parentId, index). A full-order list would
 *  let one user's later reorder silently swallow another's undo (ADR 002 §2).
 *
 *  (#410) `parentId` may now name a folder even when the moving item is itself
 *  a folder. The one structural refusal left is a loop — a folder moved into
 *  its own descendant — and it is enforced in `applyMove`, i.e. on replay,
 *  not only where the gesture is made. */
export type LayerMoveOperation = OperationBase & {
  type: 'layer_move'
  /** Pre-#413 single-target form, still in recorded logs. Read both through
   *  `operationLayerIds`. */
  layerId?: string
  /** (#413) The items to relocate, inserted as one contiguous run in this
   *  order. One operation rather than one per item: a group move is one undo,
   *  and other participants see one change instead of watching a selection
   *  disassemble and reassemble itself.
   *
   *  A single `(parentId, index)` is enough for any legal group only because
   *  folders nest (#410) — before that, a set mixing folders and layers had no
   *  single container that could hold all of it. */
  layerIds?: string[]
  parentId: string | null // folder id, or null for root
  index: number           // position within the target container, top→bottom
}

/** (#412) Applies one opacity to any number of layers at once.
 *
 *  Plural rather than N separate operations for the reason `layer_transform`
 *  and `layer_delete` are already plural: one operation is one undo. N
 *  operations would make Ctrl+Z take a mass change apart layer by layer, and
 *  would let every other participant in the room watch it happen in pieces.
 *
 *  `layerId` is the pre-#412 single-target form. It is still in the recorded
 *  logs of every live room, so it stays readable forever; new operations only
 *  ever write `layerIds`. Read both through `operationLayerIds` rather than
 *  touching either field directly. */
export type LayerOpacityOperation = OperationBase & {
  type: 'layer_opacity'
  layerId?: string
  layerIds?: string[]
  opacity: number       // 0–1
}

/** (#412) Same plural shape and the same reasoning as `LayerOpacityOperation`
 *  above — including the legacy `layerId`, which recorded logs still carry. */
export type LayerVisibilityOperation = OperationBase & {
  type: 'layer_visibility'
  layerId?: string
  layerIds?: string[]
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

/** (#488) The other lock: a shared guard anyone may set and anyone may take
 *  off, stopping paint from every hand including the room owner's. Where
 *  `layer_owner_lock` is a claim about *who* may draw, this is a claim that
 *  *nobody* should right now — the "don't touch this one while we work"
 *  everyone in the room can see and undo.
 *
 *  It needs no privilege to send — that is what "anyone may take it off"
 *  means — but the server does inspect it (#518): it mirrors the flag the
 *  same way it mirrors `layer_owner_lock`, and refuses painting operations
 *  aimed at a locked layer from everyone, the room owner included. Until then
 *  the lock was a client-side courtesy, which is a different feature: any tab
 *  running an older build, or a stale one, wrote through it into everyone
 *  else's canvas. It is a real operation rather than local view state for a
 *  related reason — the alternative was tried, and a lock outside the log
 *  cannot survive a reload, since a reload has no earlier state to carry it
 *  from.
 *
 *  Single `layerId` rather than the plural shape `layer_visibility` uses, and
 *  deliberately: the server refuses layerId-bearing operations aimed at an
 *  owner-locked layer, so naming one layer is what keeps a non-owner from
 *  unlocking what the owner reserved. A mass toggle sends one per layer. */
export type LayerLockOperation = OperationBase & {
  type: 'layer_lock'
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

/** (#449) Copies one layer — pixels and all — into a brand-new layer, leaving
 *  the source untouched.
 *
 *  Deliberately its own operation rather than `layer_add` + something: the copy
 *  carries the source's pixels, and nothing already in the log can express
 *  "these pixels, again, over there". Re-recording them as an `image_import`
 *  would mean rasterizing to a data URL at emission — lossy on an infinite
 *  canvas, which has no single raster to flatten to, and enormous on the wire
 *  for something the receiving client can reproduce from state it already has.
 *
 *  Shaped like `LayerMergeOperation` above and handled alongside it everywhere,
 *  because it is the same *kind* of thing: an operation carrying pixels **and**
 *  structure at once. That combination is what decides its treatment on the
 *  snapshot path — it is never withheld from a joining client the way a pure
 *  pixel op is (the client needs its structural half), so the client skips the
 *  pixel half itself against the coverage it restored. See `isCoveredBySnapshot`
 *  in the server's rooms.ts and `_isCoveredByRestore` in the engine.
 *
 *  `sourceOpacity` is captured at emission for the same reason a merge captures
 *  its sources': replay must not depend on an opacity the source picked up
 *  afterwards. Unlike a merge it is *not* applied to the pixels — it becomes
 *  the copy's own `opacity`, so the duplicate looks exactly like what was
 *  duplicated rather than baking transparency into ink.
 *
 *  Duplicating a folder is not this operation: it is a `folder_add` plus one of
 *  these per descendant layer, emitted together (see LayerPanel's
 *  `buildDuplicateOps`). A folder holds no pixels of its own, so there is
 *  nothing here for it to copy. */
export type LayerDuplicateOperation = OperationBase & {
  type: 'layer_duplicate'
  layerId: string        // id of the new copy
  sourceId: string       // layer being copied; stays alive
  name: string
  sourceOpacity: number  // 0–1, the source's own opacity at emission time
  sourceVisible: boolean
  parentId: string | null // where the copy lands
  index: number
}

/** 2x3 affine [a, b, c, d, tx, ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty.
 *  The only encoding a layer_transform had before #392. */
export type AffineMatrixTuple = [number, number, number, number, number, number]

/** 3x3 projective (homography), column-major to match the affine tuple's own
 *  column-major reading and gl.uniformMatrix3fv's required layout:
 *  [a, b, g, c, d, h, tx, ty, i] means
 *      x' = (a*x + c*y + tx) / (g*x + h*y + i)
 *      y' = (b*x + d*y + ty) / (g*x + h*y + i)
 *  An affine map is the case g = h = 0, i = 1 — which is exactly what
 *  toHomography() produces from the six-number form. */
export type HomographyMatrixTuple = [
  number, number, number,
  number, number, number,
  number, number, number,
]

/** What travels on the wire (#392). Six numbers is not legacy-and-deprecated
 *  — it stays the encoding every affine gizmo drag emits, because writing
 *  three constants into every log entry for the common case is pure waste.
 *  Nine numbers appears only when a Distort actually needs it.
 *
 *  Consumers never branch on the length: they call toHomography() once at
 *  the read boundary and work in 3x3 from there. That is what keeps a
 *  projective transform from becoming a second code path through undo,
 *  snapshots and the bake — mathematically an affine map *is* a homography,
 *  and the shader already multiplies by a mat3 either way. It is also why
 *  every operation log recorded before #392 (kept on purpose as a dataset,
 *  #375) stays readable forever with no migration. */
export type LayerTransformMatrix = AffineMatrixTuple | HomographyMatrixTuple

/** Widens the wire form to the 3x3 every consumer actually works in. */
export function toHomography(matrix: LayerTransformMatrix): HomographyMatrixTuple {
  if (matrix.length === 9) return matrix
  const [a, b, c, d, tx, ty] = matrix
  return [a, b, 0, c, d, 0, tx, ty, 1]
}

/** True when a homography has no projective part, i.e. it round-trips to the
 *  compact six-number form without loss. Emitters use it to keep affine drags
 *  on the affine encoding even while composing in 3x3; the epsilon is
 *  absolute because g and h are in units of 1/px, where anything at 1e-12 is
 *  accumulated float noise and not a perspective anyone drew. */
export function isAffineHomography(m: HomographyMatrixTuple): boolean {
  return Math.abs(m[2]) < 1e-12 && Math.abs(m[5]) < 1e-12 && Math.abs(m[8] - 1) < 1e-12
}

/** Narrows back to the compact form when there is no projective part to lose,
 *  so an ordinary move/scale/rotate still writes six numbers. Returns the
 *  nine-number form unchanged when it genuinely carries perspective. */
export function toWireMatrix(m: HomographyMatrixTuple): LayerTransformMatrix {
  return isAffineHomography(m) ? [m[0], m[1], m[3], m[4], m[6], m[7]] : m
}

/** Transforms (translate/scale/rotate/skew/distort) one or more layers' pixel
 *  content in place — one operation regardless of how many layers a gizmo
 *  moved together, so undo/redo flips them all atomically (a partial
 *  transform applied to some selected layers but not others would be a worse
 *  bug than a slightly bigger log entry — see #120 discussion). Background is
 *  never a legal target, same as other structural ops. */
export type LayerTransformOperation = OperationBase & {
  type: 'layer_transform'
  transforms: Array<{
    layerId: string
    matrix: LayerTransformMatrix
  }>
}

/** (#446) A closed polygon in the same space layer pixels live in — canvas
 *  pixels for a bounded room, world units for an infinite one, exactly what
 *  `Dab.x/y` and `LayerTransformOperation.matrix` already use. Flat
 *  `[x0, y0, x1, y1, ...]` rather than `Array<{x, y}>` because a freehand
 *  lasso records a point per pointer sample and this rides in the permanent
 *  operation log: the flat form is ~2.5x smaller as JSON and needs no
 *  decoding on the replay path.
 *
 *  One polygon, not a list of them: a v1 selection is a single region, and
 *  add/subtract (which is what would need several sub-paths, with a fill rule
 *  to go with them) is deliberately out of scope. The three ways to draw one
 *  — rectangle, point-by-point lasso, freehand lasso — differ only in how the
 *  UI collects the points, and a rectangle is simply its four corners; none
 *  of them reaches the wire as its own kind, which is why nothing downstream
 *  branches on how a selection was made.
 *
 *  The closing edge is implicit (last point back to first) and self-
 *  intersection is legal — the rasterizer fills by nonzero winding, so a
 *  lasso that crosses itself has a defined result rather than a rejected one.
 *
 *  Note the space: these are *layer* coordinates, never screen ones. The
 *  viewport is per-user local state (CLAUDE.md), so a selection recorded in
 *  screen pixels would land somewhere else on every other participant's
 *  canvas. */
export type SelectionShape = {
  points: number[]
}

/** (#446) The three operations a selection can produce. All three are pure,
 *  single-layer pixel operations — they paint one layer and leave structure
 *  untouched — which is what lets them join `stroke`/`image_import`/
 *  `layer_clear` as snapshot-*coverable* on the server (rooms.ts's
 *  COVERABLE_OP_TYPES), unlike `layer_transform`, which names several layers
 *  at once and therefore can never be withheld from a joining client.
 *
 *  Single-layer is a decision, not an omission. `layer_transform` moves whole
 *  layers and a gizmo can hold several of them at once; a *selection* is a
 *  region drawn on the drawing in front of you, and the drawing in front of
 *  you is the active layer. Multi-layer would need the plural-with-atomic-
 *  undo shape `layer_transform` has (see its docstring) and buys a case
 *  nobody asked for; if it is ever wanted, it arrives the way #412/#413 added
 *  plurals elsewhere — additively, without invalidating a single operation
 *  already in the log.
 *
 *  Moves the pixels inside `selection` — and only those — through `matrix`,
 *  in place on one layer. The region is lifted (the source pixels are erased
 *  from the layer) and stamped down transformed, i.e. a move leaves a hole,
 *  which is what "move this piece of my drawing" means everywhere else. To
 *  keep a copy, the UI copies first and pastes; that is `area_paste`, not a
 *  flag here. */
export type AreaTransformOperation = OperationBase & {
  type: 'area_transform'
  layerId: string
  selection: SelectionShape
  matrix: LayerTransformMatrix
}

/** (#446) Erases everything inside `selection` on one layer — what both
 *  "delete" and the erase half of "cut" emit. `layer_clear` with a mask, and
 *  deliberately a separate type rather than an optional field on it: a
 *  `layer_clear` carrying an ignored `selection` would still wipe the whole
 *  layer on any client built before this existed, and the operation log is
 *  permanent. */
export type AreaClearOperation = OperationBase & {
  type: 'area_clear'
  layerId: string
  selection: SelectionShape
}

/** (#446) Stamps a raster onto an existing layer at a given world rect —
 *  what "paste" emits, including a paste onto a layer other than the one the
 *  pixels were copied from.
 *
 *  Carries the pixels rather than a reference to where they came from
 *  (source layer + mask + the seq it was copied at), which would be smaller
 *  and is the wrong shape: replay would resolve that reference against the
 *  source layer *as it stands at the paste's own position in the log*, so
 *  painting over the original after copying — or undoing the stroke it came
 *  from — would retroactively change what had already been pasted. Clipboard
 *  contents are a snapshot at copy time on every other tool that has one, and
 *  a snapshot is what a raster in the operation is.
 *
 *  Distinct from `image_import`, which is imposed on a freshly created layer
 *  and fit-centers within the canvas (see its docstring) — the invariant that
 *  it never lands on content that already exists is worth keeping, so paste
 *  gets its own type instead of widening it.
 *
 *  `image` is a PNG data URL with straight (un-premultiplied) alpha, the same
 *  encoding `image_import` uses and the same one `_blitImage` premultiplies
 *  on the way into a layer buffer. `x`/`y` are the world-space top-left
 *  corner and `width`/`height` the rect it covers — always the raster's own
 *  natural size.
 *
 *  `matrix` is where it was moved to before it was let go. A pasted piece
 *  floats above the layer until it is dropped (ADR 008, "Плавающее
 *  выделение"), and whatever placing happened in between arrives here: one
 *  operation for the whole paste-place-drop gesture, rather than a paste
 *  followed by a transform of the region it landed in.
 *
 *  That second form would be wrong as well as clumsy. A transform lifts
 *  *everything* inside its mask, and by then that includes whatever was
 *  already under the pasted piece — which is exactly the bug the floating
 *  model exists to remove (Ilya, 13.08: "двигаться начинает и тот что
 *  вставился и тот что я изначально выделил").
 *
 *  Absent means identity — what a paste dropped where it landed writes.
 *  Applied about the world origin like `layer_transform`'s own matrix; the
 *  rect is not a second coordinate system, it is where the raster sits before
 *  the matrix acts. */
export type AreaPasteOperation = OperationBase & {
  type: 'area_paste'
  layerId: string
  image: string
  x: number
  y: number
  width: number
  height: number
  matrix?: LayerTransformMatrix
}

/** (#453) Which pixels the fill reads its boundaries from. `visible` is the
 *  composite of every visible layer — the lineart-above/colour-below case that
 *  is most of what a bucket is for — and `layer` is the target layer alone.
 *  Paint lands in the target layer either way; this only chooses what counts
 *  as a wall.
 *
 *  Ordered as the settings UI shows them, `visible` first because it is the
 *  default. */
export const FILL_SOURCES = ['visible', 'layer'] as const

export type FillSourceMode = (typeof FILL_SOURCES)[number]

/** (#453) What the fill tool records: the region it worked out, as pixels.
 *
 *  Same raster-in-a-world-rect shape as `area_paste` above, and painted by the
 *  same code — a fill *is* a stamp of a raster onto a layer. `image` is a PNG
 *  data URL with straight alpha whose RGB is the fill colour flat across the
 *  whole rect and whose alpha is the coverage mask; `x`/`y`/`width`/`height`
 *  place it, always at the raster's natural size (a fill is never resampled —
 *  it is computed at the pixels it lands on).
 *
 *  **Why the result and not the recipe.** The obvious encoding is the one the
 *  user performed: seed point, tolerance, gap closing, and let every client
 *  flood-fill its own copy of the layer. That fails the cross-device
 *  determinism rule in `.claude/rules.md`, and fails it worse than most things
 *  do. A flood fill is a *threshold* over pixels that came off the GPU, and a
 *  threshold amplifies: two devices whose graphite agrees to a
 *  least-significant bit disagree about which side of `tolerance` one pixel of
 *  a pencil line sits on, and one pixel is the whole difference between a
 *  filled shape and a filled canvas. It would also put a full-domain readback
 *  and scan on the main thread of every participant replaying a room.
 *
 *  The freedom that buys is worth stating: because only the author ever runs
 *  the algorithm, the algorithm is not part of the contract. Tolerance, gap
 *  closing and the antialiased rim can be rewritten, or replaced with a
 *  perceptual metric, without versioning this operation or touching a single
 *  one already in the log. Compare `area_transform`, which ships a polygon
 *  every participant rasterizes and is therefore pinned to the byte.
 *
 *  **Why not `area_paste`.** Mechanically it would fit — and that is the
 *  point at which it stops being a good idea. The log is permanent and kept on
 *  purpose as a dataset (#375); a fill recorded as a paste is a fill nobody
 *  can ever find again. The parameters below carry it: nothing on the replay
 *  path reads them, they exist so the record says what happened.
 *
 *  A pure single-layer pixel operation like the three `area_*` ops next door,
 *  so a layer snapshot can stand in for it (`COVERABLE_OP_TYPES`). */
export type AreaFillOperation = OperationBase & {
  type: 'area_fill'
  layerId: string
  image: string
  x: number
  y: number
  width: number
  height: number
  /** Where the user tapped, in the same layer space as `Dab.x/y`. Replay
   *  ignores it, as it does every field below — see the docstring. */
  seedX: number
  seedY: number
  color: [number, number, number]
  tolerance: number
  gapClose: number
  expand: number
  source: FillSourceMode
}

// ── Shapes (#525, epic) ───────────────────────────────────────────────────
//
// A shape is a rectangle, ellipse, star or line laid down in one gesture: the
// tool that draws a frame around a thumbnail sketch, and the one that puts
// masses on the sheet for a composition exercise. It paints into a layer like
// every other mark — it is part of the drawing, not an overlay over it (that
// is what an annotation is, see above).
//
// **The recipe, not the result** — the opposite call from `area_fill` next
// door, and for the opposite reason. A fill records its pixels because the
// region it covers was derived from *this* device's GPU output and no other
// participant can reproduce it (see AreaFillOperation's docstring). A shape
// is derived from nothing: a rectangle is four numbers and a corner radius,
// and every client can draw it from those. Recording a raster instead would
// put a base64 PNG the size of the shape into a log that is permanent and
// kept as a dataset (#375), and would pin the shape to the resolution it was
// drawn at.
//
// What that buys, and what it costs, are both worth stating. It buys size,
// fidelity at any zoom, and a record that says what the user actually did.
// It costs the guarantee `area_fill` bought: every client rasterizes these
// numbers itself, so the rasterizer *is* part of the contract and falls under
// the cross-device determinism rule in `.claude/rules.md` — see #527 for the
// side-by-side check that must pass and the CPU fallback if it does not.
//
// Colour is `[r, g, b]` floats, like a stroke's and unlike an annotation's hex
// string: these pixels are handed to WebGL, so they are written the way their
// renderer takes them. There is no alpha — deliberately, until the app has one
// coherent notion of transparency (Ilya, 05.09; today "colour alpha" and
// "pencil opacity" are two different stories).

export const SHAPE_KINDS = ['rectangle', 'ellipse', 'polystar', 'line'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

/** Where a stroke of finite width sits relative to the contour it follows.
 *  Not cosmetic: a 400×300 frame stroked 10 wide is 400×300 only with
 *  `inside`, and drawing a frame of an exact size is half of why the tool
 *  exists. */
export const SHAPE_STROKE_ALIGNS = ['inside', 'center', 'outside'] as const
export type ShapeStrokeAlign = (typeof SHAPE_STROKE_ALIGNS)[number]

/** How a stroke turns a corner. Distinct from a shape's own `cornerRadius`,
 *  which changes the *contour*: a mitred corner on a rounded rectangle is a
 *  contradiction in terms, and a bevelled one on a sharp rectangle is not. */
export const SHAPE_STROKE_JOINS = ['miter', 'round', 'bevel'] as const
export type ShapeStrokeJoin = (typeof SHAPE_STROKE_JOINS)[number]

/** How a stroke ends where the contour does — lines only; every other shape
 *  here is a closed contour with no ends to cap. */
export const SHAPE_STROKE_CAPS = ['butt', 'round', 'square'] as const
export type ShapeStrokeCap = (typeof SHAPE_STROKE_CAPS)[number]

/** Ceiling on a star's vertex count. Enforced where the operation is built,
 *  never on replay — an operation already in the log must keep replaying
 *  whatever it says, so a limit that rejected on replay would be a way to make
 *  an old room stop loading (same rule as MAX_ANNOTATION_INK_POINTS). */
export const MIN_POLYSTAR_POINTS = 3
export const MAX_POLYSTAR_POINTS = 60

/** What the shape *is*, in the frame's own normalized space — everything here
 *  is independent of where the shape was put and how big it is, which is what
 *  lets `ShapeFrame` carry placement alone and lets an annotation reuse this
 *  type later without inheriting a layer-space rectangle.
 *
 *  Angles are radians, measured from +X and increasing clockwise on screen
 *  (layer space has Y pointing down, so clockwise is what a positive angle
 *  looks like). The UI shows degrees; the wire keeps radians, like every other
 *  angle in the protocol. */
export type ShapeGeometry =
  /** `cornerRadius` in layer units, clamped by the rasterizer to half the
   *  shorter side — a radius larger than the shape is not an error, it is a
   *  stadium, and clamping is how it gets there. */
  | { kind: 'rectangle'; cornerRadius: number }
  /** The Oval of Adobe Animate, which is why there is no separate "oval" tool:
   *  the difference that would have justified one is these parameters.
   *
   *  `startAngle`/`endAngle` cut a sector; equal values (or a full turn apart)
   *  mean the whole ellipse. `innerRadius` is a fraction 0..1 of the way from
   *  the centre to the edge, so 0 is solid and 0.5 is a ring half as thick as
   *  the radius. `closePath` decides whether a *sector's* stroke closes across
   *  its open side; the fill is always the closed region, because a fill of an
   *  open contour has no meaning anyone would predict. */
  | {
      kind: 'ellipse'
      startAngle: number
      endAngle: number
      innerRadius: number
      closePath: boolean
    }
  /** Regular polygon and star in one, as in Animate and Lottie: `innerRadius`
   *  0 is a polygon, anything above it pulls alternate vertices inward and
   *  makes it a star. `rotation` turns the vertices inside the frame, which is
   *  not what `ShapeFrame.angle` does — that turns the frame itself, and on a
   *  non-square frame the two produce different shapes. */
  | {
      kind: 'polystar'
      points: number
      innerRadius: number
      rotation: number
      cornerRadius: number
    }
  /** A line runs corner to corner of its frame — see ShapeFrame on why the
   *  frame's width and height are signed. */
  | { kind: 'line'; cap: ShapeStrokeCap }

/** Where the shape sits, in the same layer space as `Dab.x/y` and
 *  `AreaFillOperation`'s rect (canvas coordinates in a bounded room, world
 *  coordinates in an infinite one).
 *
 *  `width`/`height` are **signed**, and that is not sloppiness left over from
 *  a drag: a line from the top-left corner to the bottom-right one and a line
 *  from the top-right to the bottom-left occupy the same rectangle, and the
 *  sign is the only thing that tells them apart. Shapes that are symmetric
 *  about both axes simply ignore it.
 *
 *  `angle` rotates the frame about its own centre. Rotation only — no skew and
 *  no projective term, unlike `LayerTransformMatrix`: a sheared frame has no
 *  single stroke width, and shearing a shape after the fact is what the
 *  transform tool is for. */
// (`type`, not `interface`, for this and the two below — deliberately. An
// operation is written to a Prisma JSON column, and Prisma's InputJsonValue is
// an index-signature type: TypeScript gives type aliases an implicit index
// signature and interfaces none, so an interface here fails to typecheck at
// persistOperation with an error that names Prisma and says nothing about
// shapes.)
export type ShapeFrame = {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

/** `null` on the operation means "no stroke" — the explicit absence the UI
 *  shows as a crossed-out swatch, not a zero width. Width is in layer units,
 *  like everything else here. */
export type ShapeStroke = {
  color: [number, number, number]
  width: number
  align: ShapeStrokeAlign
  join: ShapeStrokeJoin
}

/** `null` means "no fill". Its own type rather than a bare colour so that a
 *  fill can gain properties (a texture, a gradient) without every shape
 *  operation ever recorded having to be reinterpreted. */
export type ShapeFill = {
  color: [number, number, number]
}

/** One shape, laid down in one gesture, into one layer.
 *
 *  A pure single-layer pixel operation like the four `area_*` ops above, so a
 *  layer snapshot can stand in for it (`COVERABLE_OP_TYPES` on the server).
 *
 *  One operation for the whole gesture, including everything that happened
 *  after the pen came up: a shape stays editable until it is confirmed (Enter,
 *  a click past it, or switching tools — the transform tool's contract, see
 *  #528), and only the confirmed result is recorded. Nothing about that
 *  editing session reaches the log, which is why one shape is one undo.
 *
 *  A shape with neither stroke nor fill is not emitted at all — it would be an
 *  operation that provably paints nothing, and the log is permanent. */
export type ShapeOperation = OperationBase & {
  type: 'shape'
  layerId: string
  geometry: ShapeGeometry
  frame: ShapeFrame
  stroke: ShapeStroke | null
  fill: ShapeFill | null
}

/** The world rect a shape's pixels can reach: its frame, rotated, grown by
 *  whatever the stroke puts outside the contour, plus a pixel of margin for
 *  the antialiased rim.
 *
 *  Lives here rather than in the engine because both sides need the same
 *  answer and they must not drift: the engine resolves which tiles to paint
 *  from it, and the UI hit-tests and frames the gizmo against it. An
 *  underestimate is a shape clipped at a tile boundary — the kind of bug that
 *  shows up only on the second tile, i.e. only on a big shape. */
export function shapeWorldBounds(
  geometry: ShapeGeometry, frame: ShapeFrame, stroke: ShapeStroke | null,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const halfW = Math.abs(frame.width) / 2
  const halfH = Math.abs(frame.height) / 2
  const cx = frame.x + frame.width / 2
  const cy = frame.y + frame.height / 2

  // How far past the contour the stroke reaches. `outside` puts all of it
  // there, `center` half; a mitre can reach further still at a sharp corner,
  // and a square cap pushes half a width past each end of a line.
  let outset = 0
  if (stroke) {
    if (stroke.align === 'outside') outset = stroke.width
    else if (stroke.align === 'center') outset = stroke.width / 2
    if (stroke.join === 'miter') outset += stroke.width
    if (geometry.kind === 'line' && geometry.cap !== 'butt') outset += stroke.width
  }
  // The stroke's reach is measured in the frame's own space (it follows the
  // contour, so it turns with it) and the antialiasing margin in world space,
  // added after the rotation — a margin rotated along with the frame would be
  // sqrt(2) times itself at 45 degrees, which is harmless but says something
  // untrue about what the rim costs.
  const c = Math.abs(Math.cos(frame.angle))
  const s = Math.abs(Math.sin(frame.angle))
  const ext = halfW + outset
  const eyt = halfH + outset
  const rx = ext * c + eyt * s + 1
  const ry = ext * s + eyt * c + 1

  return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry }
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

// ── Annotations (#508, эпик #87) ──────────────────────────────────────────
//
// An annotation is a remark laid *over* the drawing: a teacher circling a
// wrong proportion, a note pinned next to a hand that needs redrawing. It is
// permanent — it must survive a reload and be there at the next join, or it is
// useless for homework — but it is deliberately NOT part of the picture:
//
//   - it never enters a layer's pixel buffer, so no snapshot ever bakes it and
//     no `layer_clear`/`layer_merge` can take it with them;
//   - it is drawn by an SVG/DOM overlay riding `canvasWrap`'s own viewport
//     transform (the GridOverlay/RulerOverlay/PeerCursors pattern), which is
//     what lets a reader hide every annotation locally with a flag instead of
//     a `layer_visibility` operation that would blank them for the whole room;
//   - it is excluded from export and from the room thumbnail (decision, Ilya
//     26.08) — those bake the composite, and an annotation is not the drawing.
//
// The consequences of that choice are worth naming, because each one removed a
// problem rather than deferring it: an overlay knows nothing about pressure,
// so a finger can draw one with no pressure to emulate; text stays text, so it
// is editable and sharp at any zoom, and no font has to rasterize identically
// across devices to keep the room in sync (see .claude/rules.md's cross-device
// determinism rule — this design sidesteps it entirely instead of obeying it).
//
// Colour is a hex string here and `[r,g,b]` floats on a StrokeOperation. Not
// an inconsistency: a stroke's colour is handed to WebGL, an annotation's is
// handed to SVG, and each is written in the form its renderer actually takes.

export const ANNOTATION_KINDS = ['text', 'ink'] as const
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number]

/** What an annotation *is*, without the identity the log already carries.
 *  Coordinates are canvas/world space, exactly like `AreaFillOperation`'s —
 *  the overlay rides the same transform as the canvas, so an annotation stays
 *  glued to the paper through pan/zoom/rotate rather than floating in screen
 *  space.
 *
 *  `size` means two different things, and the split is deliberate rather than
 *  sloppy — it follows what each of the two is:
 *
 *   - **ink** is a mark *on* the paper, so its width is in canvas units and it
 *     grows and shrinks with the drawing, like every stroke does;
 *   - **text** is a pin stuck in the paper with a note attached, so its size is
 *     in *screen* pixels and stays legible at any zoom. The point it is pinned
 *     to is world space; the note hanging off it is interface. A remark you
 *     cannot read when you zoom out to look at the whole picture is useless at
 *     exactly the moment you want it, which is what canvas-unit text gave. */
export type AnnotationShape =
  | { kind: 'text'; x: number; y: number; color: string; size: number; text: string }
  /** `points` is flat `[x0, y0, x1, y1, …]` rather than `{x, y}[]`: an ink
   *  annotation is recorded once and read forever, and the flat form is a
   *  little over half the JSON of the object form for the same numbers. */
  | { kind: 'ink'; color: string; size: number; points: number[] }

/** An annotation as it exists after folding the log: its shape plus the two
 *  identity fields taken from the operation that created it. `authorId` is
 *  stamped at fold time rather than carried on the wire — the operation
 *  already says who sent it, and a second copy is a second thing that can
 *  disagree. */
export type Annotation = AnnotationShape & { id: string; authorId: string }

/** Ceilings on what one annotation may carry. Both are enforced where the
 *  operation is built, not on replay: an operation already in the log is
 *  permanent and must keep replaying whatever it says, so a limit that
 *  rejected on replay would be a way to make an old room stop loading. */
export const MAX_ANNOTATION_TEXT_LENGTH = 500
/** Ink is simplified (RDP) before it is recorded; this is the backstop for a
 *  gesture that survives simplification anyway — a very long scribble at very
 *  low zoom. Points, not coordinates: the flat array holds twice this. */
export const MAX_ANNOTATION_INK_POINTS = 2000

export const DEFAULT_ANNOTATION_COLOR = '#e5484d'
/** Screen pixels — see AnnotationShape on why text is measured differently
 *  from ink. Sized like the interface's own body text, because that is what a
 *  remark is: a sentence, not a heading. */
export const DEFAULT_ANNOTATION_TEXT_SIZE = 13
export const DEFAULT_ANNOTATION_INK_WIDTH = 8

/** Creates one annotation. `annotationId` is the annotation's own id, distinct
 *  from the operation's: `annotation_update` and `annotation_delete` target the
 *  annotation, and an operation id would tie them to the act of creating it. */
export type AnnotationAddOperation = OperationBase & {
  type: 'annotation_add'
  annotationId: string
  shape: AnnotationShape
}

/** Edits an existing annotation in place — fixing a typo, dragging a note to a
 *  better spot, recolouring it.
 *
 *  A third operation type rather than delete+add, and the reason is undo: a
 *  typo corrected by delete+add is two entries on the stack, so one Ctrl+Z
 *  leaves the annotation deleted and the user pressing it again to get back to
 *  where they started. The Operation Log is permanent, so this is the kind of
 *  economy that cannot be corrected later.
 *
 *  Fields absent from the patch are left as they were. A field that does not
 *  belong to the target's kind (`text` on an ink annotation) is ignored on
 *  replay rather than rejected — see `applyAnnotationOp`. */
export type AnnotationPatch = {
  x?: number
  y?: number
  color?: string
  size?: number
  text?: string
  points?: number[]
}

export type AnnotationUpdateOperation = OperationBase & {
  type: 'annotation_update'
  annotationId: string
  patch: AnnotationPatch
}

/** Plural for the same reason `layer_delete` is: clearing several remarks at
 *  once is one action and must be one undo. */
export type AnnotationDeleteOperation = OperationBase & {
  type: 'annotation_delete'
  annotationIds: string[]
}

/** The three types as data, for the server-side lists that decide what stays
 *  resident and what a snapshot covers. Exported from `shared` rather than
 *  written out on the server so the two cannot drift: an annotation type
 *  missing from the server's coverage rule is not a compile error, it is
 *  annotations silently disappearing from old rooms. */
export const ANNOTATION_OP_TYPES = ['annotation_add', 'annotation_update', 'annotation_delete'] as const

export type AnnotationOperation =
  | AnnotationAddOperation
  | AnnotationUpdateOperation
  | AnnotationDeleteOperation

export function isAnnotationOperation(op: { type: string }): op is AnnotationOperation {
  return (ANNOTATION_OP_TYPES as readonly string[]).includes(op.type)
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
  | LayerLockOperation
  | LayerClearOperation
  | LayerMergeOperation
  | LayerDuplicateOperation
  | LayerTransformOperation
  | AreaTransformOperation
  | AreaClearOperation
  | AreaPasteOperation
  | AreaFillOperation
  | ShapeOperation
  | OperationRevokeOperation
  | OperationUndoOperation
  | OperationRedoOperation
  | AnnotationAddOperation
  | AnnotationUpdateOperation
  | AnnotationDeleteOperation

/** (#518) The layers whose *pixels* `op` changes — the only question a lock
 *  needs answered.
 *
 *  Exists because the lock used to be enforced in exactly one place: the gate
 *  on starting a stroke (`engine.setLocked`, see the Room page). Everything
 *  that paints without going through the pointer pipeline — the transform
 *  gizmo, the bucket, delete/cut/paste of a selection — walked straight past
 *  it and rewrote a locked layer. Enumerating the painting operations *here*,
 *  once, in the package both sides import, is what makes that class of hole
 *  closable rather than a list of five call sites somebody has to remember to
 *  extend.
 *
 *  The default is the strict one: a new operation type is refused on a locked
 *  layer only if it is named below, so the failure mode of forgetting to add
 *  one is a lock that leaks — which is why this returns the honest answer for
 *  every type rather than a policy. What is *exempt* is decided by the callers
 *  and stated there.
 *
 *  Deliberately not `operationLayerIds`: that reads two fields on the
 *  structural shape (`layerId`/`layerIds`) and cannot see `layer_transform`'s
 *  per-layer `transforms` list at all — which is precisely how a transform of
 *  an owner-locked layer got past the server for as long as it did (see
 *  rooms.ts's `ownerLockedTargets`). */
export function paintedLayerIds(op: OperationDraft): string[] {
  switch (op.type) {
    case 'stroke':
    case 'image_import':
    case 'layer_clear':
    case 'area_transform':
    case 'area_clear':
    case 'area_paste':
    case 'area_fill':
    // (#525) A shape paints one layer and nothing else, so it belongs here
    // from the first line of its existence — a painting operation missing
    // from this list is a layer lock that silently leaks (#518).
    case 'shape':
      return [op.layerId]
    case 'layer_transform':
      return op.transforms.map(t => t.layerId)
    // A merge writes its pixels into a layer it creates in the same breath
    // (`layerId` is the *new* layer — see LayerMergeOperation), and a
    // duplicate likewise. Neither can paint into a layer that already exists,
    // so neither is a lock question.
    default:
      return []
  }
}

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
 *  sits in and never a thing the client has to render.
 *
 *  (#415, трек #314 §1) `server_busy` — единственная из причин, которая не про
 *  спрашивающего и не про комнату, а про коробку: сервер у потолка кучи, и
 *  холодная загрузка ещё одной комнаты — та самая аллокация, после которой
 *  падает процесс и с ним все идущие уроки разом. Отказать одному входящему
 *  дешевле, и он единственный, кому в этот момент ещё можно помочь.
 *
 *  Проходит только по холодному пути: комната, уже резидентная (то есть
 *  идущий урок), этим гейтом не проверяется вовсе — участник такой комнаты
 *  ничего к куче не добавляет. */
export type JoinDenial =
  | 'not_found'
  | 'wrong_password'
  | 'access_revoked'
  | 'login_required'
  | 'pending_approval'
  | 'server_busy'

export type JoinResult =
  | { ok: true; userId: string }
  | { ok: false; error: JoinDenial }

/** Peer cursor position (#37). Sent only while the sender is *not* drawing.
 *
 *  (#431) This used to carry a `drawing` flag, and peers froze the cursor dot
 *  wherever it last was for as long as it was true. That was the only sane
 *  choice at the time: the stroke's shape was unknown until the finished
 *  StrokeOperation arrived, so a cursor that kept following the pointer would
 *  have run seconds ahead of its own ink. Freezing was less wrong than lying.
 *
 *  With the stroke streaming live (#429) the flag has nothing left to do, so
 *  it is gone rather than left as a field nobody reads. While the pen is down
 *  a peer's cursor position comes from the last dab it actually painted — the
 *  same packets that draw the ink — which is what makes the dot and the line
 *  it is drawing incapable of disagreeing: they are the same data. And since
 *  the dab stream already carries the position, sending cursor packets during
 *  a stroke would be spending ~30 packets a second to say it again, less
 *  accurately. */
export type CursorMoveData = {
  x: number
  y: number
}

/** (#429) One packet of an in-progress stroke, streamed to the room while the
 *  pen is still down.
 *
 *  This is deliberately **not** an Operation and never enters the log: it is
 *  not assigned a `seq`, not persisted, not acknowledged, and not replayed on
 *  join. The gesture's authoritative record is still the StrokeOperation(s)
 *  emitted at pen-up (and at every STROKE_DAB_CHUNK_LIMIT boundary along the
 *  way) through the ordinary `operation` path. This carries the same dabs
 *  early, so peers can watch the mark appear instead of waiting out the whole
 *  gesture and then watching it replay at its recorded pace — see #428 for the
 *  latency arithmetic that motivated it.
 *
 *  Because the dabs here are the *same* dabs the eventual operation carries —
 *  the engine bakes them once, at paint time — the handoff from streamed ink to
 *  committed ink is exact. That is the difference from the abandoned #37
 *  attempt, which approximated the stroke from cursor positions and visibly
 *  snapped when the real operation landed.
 *
 *  `packetSeq` counts packets within one gesture from 0, so a receiver can tell
 *  "I have every packet so far" from "I missed one". Within a single socket
 *  connection a gap is impossible (TCP does not reorder or drop inside one
 *  connection), so a gap means the connection broke — the same conclusion, and
 *  the same full-resync response, that a gap in `operation_confirmed` already
 *  triggers. It is not a reason to reorder or wait.
 *
 *  Sent reliably, not `volatile`: a receiver paints these dabs straight into
 *  the real layer, so a silently dropped packet would leave a permanently wrong
 *  layer rather than a momentary glitch. Backpressure is handled where it
 *  belongs — the sender coalesces dabs into one packet per interval instead of
 *  emitting per frame. */
export type StrokeLiveData = {
  strokeId: string
  layerId: string
  tool: ToolType
  preset: string
  color: [number, number, number]
  packetSeq: number
  /** Same packing as StrokeOperation.dabsPacked — see packDabs/unpackDabs. */
  dabsPacked: string
  /** (#468) The wash this gesture belongs to, mirroring StrokeOperation.washId.
   *
   *  Only watercolor sets it, and it exists because a wash is the one thing in
   *  this engine that spans *several* strokes: they share one accumulation, so
   *  a peer that groups them differently from the author paints a different
   *  picture. The author decides the grouping (using wall-clock timing a peer
   *  must never see) and stamps the answer here and on the operation, so every
   *  receiver reproduces the decision instead of re-taking it.
   *
   *  It has to ride the *live* packet and not only the operation. A peer paints
   *  from this stream while the pen is still down, and by the time the
   *  operation arrives the stream has usually delivered the whole stroke — so
   *  the operation paints nothing and the grouping it carries is never read.
   *  Measured before this field existed: 84.6% of the mark differed between
   *  author and peer, up to 64/255 per channel. */
  washId?: string
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
  // (#518) The shared lock (`layer_lock`) — distinct from
  // `layer_owner_locked` because it is a different rule, not a different
  // holder of the same one: it stops painting alone (a locked layer can still
  // be renamed, moved, cleared, duplicated and deleted) and it binds the room
  // owner too, so neither the reason nor the wording for it is the owner
  // lock's.
  | 'layer_locked'
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
  // server has no room to record against. Transient — the client simply sent
  // too early — so the client retries rather than discarding the operation
  // (see TRANSIENT_REJECT_REASONS). It exists at all because the server used
  // to `return` with no ack in this case, which is indistinguishable from a
  // dropped packet: the sender waited out its timeout and retried forever.
  // See socketHandlers.ts's 'operation' handler.
  | 'not_joined'
  // (#495) The server threw while recording or relaying this operation and
  // caught it. Not a verdict on the operation — nobody decided anything, the
  // attempt simply did not complete — so this is transient and the work is
  // kept.
  //
  // It exists for the same reason `not_joined` does: that catch used to log
  // and return without acking, which the sender cannot tell from a lost
  // packet. Worse than the wasted round trips was what it hid — the one
  // handler on the hot path deliberately wrapped in try/catch (#164, so a
  // single bad packet cannot take the process down with it) was also the one
  // place a server-side failure could happen with nothing visible anywhere
  // but a log line. See socketHandlers.ts's 'operation' handler.
  | 'server_error'

/** (#495) The reasons that are not verdicts on the operation.
 *
 *  Every other `RejectReason` is the server having decided something about
 *  this operation — frozen, locked, closed, target gone — and deciding it
 *  again would give the same answer, so the sender drops the work. These two
 *  decided nothing: the attempt did not complete. Retrying is the only
 *  correct response, and discarding a stroke over one would be losing a
 *  user's drawing to a condition that had nothing to do with it.
 *
 *  Lives in the contract rather than in the sender because it *is* the
 *  contract: whether a rejection is final is a property of the reason, and
 *  the alternative — a client-side list of special cases — is how the next
 *  transient reason gets silently treated as final. See Outbox.runAttempt. */
export const TRANSIENT_REJECT_REASONS = ['not_joined', 'server_error'] as const

export function isTransientReject(reason: RejectReason): boolean {
  return (TRANSIENT_REJECT_REASONS as readonly RejectReason[]).includes(reason)
}

export type ServerToClientEvents = {
  // `latestSnapshotSeq` is null until anyone has stored a snapshot for this
  // room (short rooms) — `tailOperations` is then simply the room's entire
  // history, same shape/behavior as before the #149 epic. Once non-null the
  // caller is expected to fetch the stored snapshots itself
  // (GET /api/rooms/:id/snapshots/index, then one blob per layer — #427); the
  // seq is the structure's own, and is what a history backfill anchors on.
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
  // (#429) A peer's in-progress stroke, relayed as it is drawn — see
  // StrokeLiveData. Sent via `socket.to`, not `io.to`: unlike
  // operation_confirmed, the author gains nothing from receiving their own
  // (their own ink is already on their own layer, painted at pen time).
  peer_stroke_live: (data: StrokeLiveData & { userId: string }) => void
  peer_stroke_live_end: (data: { userId: string; strokeId: string }) => void
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
  // Sent when a request is decided — including when the decision was made
  // implicitly, by inviting the address they were queued under. On `approved`
  // the client finishes the join it was refused (it re-emits `join_room`); the
  // server holds nothing open in the meantime, so a client that missed this
  // event while offline simply gets in on its next attempt.
  //
  // (#387) Two audiences, one payload: the asker, whose join screen resolves
  // itself, and the *owner*, whose waiting queue (#380) has to lose the row.
  // The owner needs it because the decision is not always theirs to observe
  // locally — answering from the lesson list, or from a second device, leaves
  // the room's queue showing someone who is already in. `requestId` is what
  // makes that removal exact: without it the receiver knows a request was
  // answered but not which, and can only re-read the whole queue.
  join_request_resolved: (data: { roomId: string; requestId: string; approved: boolean }) => void
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
      // (#232) Who may enter, decided at creation rather than only afterwards
      // through the access panel. Omitted means `anyone_with_link`, which is
      // what every room did before this existed.
      //
      // Carried here, on the creation itself, and not applied afterwards over
      // REST: a room that exists open for the moment it takes a second
      // request to land is a room whose link is briefly worth more than its
      // owner intended. The *invites* do go over REST after this (see
      // Room/index.tsx) — they need the normalization and dedup that
      // roomAccessRoutes.ts already owns, and their failure mode is the safe
      // one: an invite-only room with an empty list admits nobody but the
      // owner, rather than admitting everybody.
      accessMode?: RoomAccessMode
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
  // (#429) One packet of the stroke currently under the pen — see
  // StrokeLiveData. No ack: this is not a record, and there is nothing the
  // sender would do differently on a failure. The gesture's real operation
  // follows through `operation` above.
  stroke_live: (data: StrokeLiveData) => void
  // (#429) The pen came up (or the gesture was abandoned). Lets peers close
  // their bookkeeping for this gesture immediately, rather than inferring the
  // end from the committed operation — which can arrive later, and which a
  // frozen/rejected author may never send at all.
  stroke_live_end: (data: { strokeId: string }) => void
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

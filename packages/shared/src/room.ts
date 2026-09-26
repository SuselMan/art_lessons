import type { PaperType } from './paper.js'
import type { ToggleableTool } from './toolset.js'

/** (#613) A room and a lesson as the wire knows them: access, boards,
 *  assignments, invites, participants, folders, the palette. */

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
  // (#548) Which tools this room offers, if it restricts them at all. Absent
  // means it does not — see `sanitizeEnabledTools` for why the unrestricted
  // case is an absence rather than a list of every tool.
  //
  // A property of the room, so it reads the same for the owner and for every
  // student: a teacher who put out two pencils has to see the two pencils the
  // class sees. It never touches the Operation Log — strokes drawn with a tool
  // before it was switched off keep replaying, and a peer's operation with a
  // tool this room no longer offers still paints. The toolset decides what can
  // be picked up, not what exists.
  enabledTools?: ToggleableTool[]
  // (#176, ADR 014) Boards. A lesson is a Room with no `lessonId` and is also
  // its own first board; every further board is a Room whose `lessonId` names
  // the lesson. The two are told apart by this one field, and the split it
  // draws is the whole model: everything social (participants, access, closed,
  // tools, palette, freeze) belongs to the lesson, everything content
  // (operations, snapshots, thumbnail, paper, size) to the board. Boards are
  // never listed by the room-list endpoints — they are reached through their
  // lesson's `room_state.lesson.boards`.
  //
  // On a board's own `room_state.room` the social fields (`accessMode`,
  // `hasPassword`, `closedAt`, `enabledTools`, `activeBoardId`) are the
  // *lesson's*, overlaid by the server, so a client reads one object either
  // way and never has to know where a fact lives.
  lessonId?: string
  // Position in the lesson's board strip; the lesson itself is 0. Absent on
  // rows the server builds by hand (the same optionality `parentRoomId` has).
  boardOrder?: number
  // The board the lesson's owner is on — what a joiner lands on and what a
  // following student switches to. Absent means the lesson's own first board.
  // Set only on a lesson (and overlaid onto its boards, see `lessonId`).
  activeBoardId?: string
  // (#595, ADR 015) Set together on a *personal board* — a student's own page
  // in one assignment round — and absent on every other room. Only this
  // student and the teacher (the lesson's owner) may draw on it; the server
  // refuses anyone else with `board_not_yours`.
  assignmentId?: string
  boardOwnerId?: string
  // (#595) Lesson only (overlaid onto its boards like `activeBoardId`): who
  // sees a student's personal board besides the student and the teacher.
  // Absent on rows the server builds by hand; `teacher_only` is the default.
  classVisibility?: ClassVisibility
}

/** (#595, ADR 015 §3) Whether students see each other's personal boards.
 *  `teacher_only` — only the teacher and the board's own student; `class` —
 *  everyone in the lesson may look (and only look: drawing stays the student's
 *  and the teacher's). Spelled as the Postgres enum, like `RoomAccessMode`. */
export type ClassVisibility = 'teacher_only' | 'class'

export const CLASS_VISIBILITIES: readonly ClassVisibility[] = ['teacher_only', 'class']

export function isClassVisibility(value: unknown): value is ClassVisibility {
  return typeof value === 'string' && (CLASS_VISIBILITIES as readonly string[]).includes(value)
}

/** (#595, ADR 015 §2, §11) One assignment of the lesson — "draw the cube".
 *  Its personal boards are the `BoardSummary` entries carrying its id. It
 *  never ends: the class is sent to it, called away from it and sent back
 *  (`set_class_location`), and its boards stay the students' throughout. */
export type AssignmentSummary = {
  id: string
  name: string
  order: number
  createdAt: string
}

// (#176, ADR 014) One entry of a lesson's board strip — what the client needs
// to draw the strip and to switch, nothing more. The full `Room` of a board
// arrives with its own `room_state` once the client joins it. The lesson
// itself is the first entry, at `order` 0, under its own id.
export type BoardSummary = {
  id: string
  name: string
  order: number
  // Same cache-busting key `Room.thumbnailUpdatedAt` is; absent until the
  // board has been baked once. Kept current by `board_thumbnail_updated`
  // (#595) for everyone who may see the board.
  thumbnailUpdatedAt?: string
  // (#595) Set on a personal board only — see `Room.assignmentId`. Personal
  // boards are not pages of the lesson's strip: they have their own grid, and
  // their `order` is meaningless.
  assignmentId?: string
  ownerId?: string
}

/** The lesson half of a board's `room_state` (#176): which lesson this board
 *  belongs to, every board in it, and the one the teacher is on. `id` is the
 *  lesson's id — for a room with a single board it equals `room.id`.
 *
 *  (#595) Built *for its recipient*: `boards` holds every shared board, and
 *  of the personal ones only those this person may see (their own, all of
 *  them for the teacher, all of them under `classVisibility: 'class'`, and the
 *  one in the spotlight). Which is why it arrives on its own as `lesson_state`
 *  whenever that set changes, rather than as a broadcast delta. */
export type LessonState = {
  id: string
  boards: BoardSummary[]
  // Null means the lesson's own first board — see `Room.activeBoardId`.
  activeBoardId: string | null
  // (#595, ADR 015) Every assignment round of this lesson, in order.
  assignments: AssignmentSummary[]
  // Where the class is (ADR 015 §11): an assignment — each student on their
  // own board in it — or null, everyone on the teacher's board. A following
  // student goes where this says (see the web's followTarget).
  activeAssignmentId: string | null
  // The personal board the teacher is showing everyone; null when none. A
  // following student is on it while it is set, whatever else is going on.
  spotlightBoardId: string | null
  classVisibility: ClassVisibility
  // Who has a hand up, by userId. Live only, never persisted — like freeze.
  handsRaised: string[]
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
  // (#176, ADR 014) Which board of the lesson this person is currently on.
  // Participants belong to the *lesson*, so a `room_state` lists everyone in
  // the lesson, and this is how a client tells who shares its page. The
  // server always sets it; optional in the type only so a client built before
  // boards existed keeps compiling. For a lesson with one board it equals the
  // lesson id.
  boardId?: string
}

// Room color palette (#190 epic). One palette per room (not per-user, and not
// a named/multi-palette choice) — created with DEFAULT_PALETTE_COLORS when
// the room is created; any participant can add the currently selected color
// or remove one already in the palette (toggle, not a delete-only UI).
// Modeled as a plain hex-string array rather than a `Palette { id, name }`
// type since there is exactly one per room; a richer type can be introduced
// later if multiple/named palettes are ever needed. Lives outside the
// Operation log — it's not a drawing action and must not participate in
// undo/redo/replay — and syncs via its own socket events (protocol.ts) instead of an
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

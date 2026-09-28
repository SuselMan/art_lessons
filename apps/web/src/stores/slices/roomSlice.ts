import type { StateCreator } from 'zustand'
import type {
  AssignmentSummary, BoardSummary, ClassVisibility, LessonState, Participant, RoomAccessMode, ToggleableTool,
} from '@grafetto/shared'

import { participantsReducer, type ParticipantsAction } from '../../pages/Room/participants'
import { boardsReducer, sortBoards, type BoardsAction } from '../../lib/boards/boards'
import type { PaperType } from '@grafetto/shared'

// This is the spec's vaguest bucket ("room: id, name, participants, local
// userId") — wired up in #24, folded in there since the original task
// spec never gave "room" its own dedicated migration issue the way
// layerState/viewport/tool each got. `RoomInfo` absorbs what was Room's
// own local `config`/`configRef` (same shape, renamed). `userId` has zero
// reactive consumers (read only at "moment of action," e.g. stamping an
// operation, never rendered directly) — kept as a plain store field set
// via applyIdentity, read via getState() at use-sites, deliberately never
// subscribed to reactively anywhere.
export interface RoomInfo {
  id: string
  name: string
  paper: PaperType
  // Hex color the creator picked for the paper background — see the shared
  // `Room.paperColor` doc comment. Absent on rooms created before this field
  // existed; the engine falls back to its own per-texture default then.
  paperColor?: string
  infinite: boolean
  width: number
  height: number
  // (#222) Closed for editing — see the shared `Room.closedAt` doc comment.
  // ISO timestamp while closed, absent while open. Unlike the rest of this
  // shape it changes during a session (the owner can toggle it from here or
  // from the lesson list), which is what `setRoomClosedAt` below is for.
  closedAt?: string
  // (#460) Who the room admits — the shared `Room.accessMode`, which
  // `room_state` has always carried and this shape simply used to drop.
  // Required for the reason the shared type gives: every room has a real
  // value, and an optional field would spread `?? 'anyone_with_link'`
  // fallbacks around as a second place for the default to live. The one entry
  // point that has to supply it by hand is the creator's own (nothing has
  // been received yet) — see toRoomConfig in Room/index.tsx.
  accessMode: RoomAccessMode
  // (#548) Which tools the room offers, or absent for "all of them" — the
  // shared `Room.enabledTools`, unchanged. Optional, unlike `accessMode`
  // above, and for the opposite reason: here the absence is itself the
  // meaning, so there is no default anyone could spell out wrong.
  enabledTools?: ToggleableTool[]
}

export interface RoomInfoSlice {
  room: RoomInfo | null
  setRoomInfo: (info: RoomInfo) => void
  participants: Participant[]
  applyParticipantAction: (action: ParticipantsAction) => void
  userId: string
  setUserId: (id: string) => void
  // Room palette (#190 epic) — hex colors, room-scoped like `participants`
  // above. A plain setter rather than a reducer: both events that ever touch
  // this (`room_state`, `palette_updated`) always send the full current
  // list, never a delta to fold in.
  palette: string[]
  setPalette: (palette: string[]) => void
  // (#254/#255/#256 epic) Room-wide freeze — a *reflection* of the server's
  // own ephemeral `RoomRecord.roomFrozen` (rooms.ts), same "store state
  // mirrors what's already true server/engine-side" rule this store follows
  // everywhere else (see roomStore.ts's own top-of-file comment). Set from
  // `room_state`'s `frozen` field and kept live via `room_frozen_changed`
  // (see Room/index.tsx's socket wiring). A participant's own per-user
  // freeze doesn't need a twin field here — it's already carried on their
  // own entry in `participants` above (Participant.frozen).
  roomFrozen: boolean
  setRoomFrozen: (frozen: boolean) => void
  // (#211 epic, #216) Renamed from inside the editor — the header label is
  // an owner-only inline field (see Room/index.tsx). Same shape as
  // `setRoomClosedAt` below and for the same reason: the name is a column of
  // the room that arrives inside `room` on join, so this only patches it when
  // the owner moves it. A no-op before `room` exists.
  setRoomName: (name: string) => void
  // (#222) Closed for editing. Unlike `roomFrozen` above this isn't a
  // separate field: it's a column of the room itself, so it arrives inside
  // `room` on join and this action only patches it when
  // `room_closed_changed` says it moved. A no-op before `room` exists — the
  // event can't arrive before the join that would have delivered the room.
  setRoomClosedAt: (closedAt: string | null) => void
  // (#460) Same shape and same reasoning as `setRoomClosedAt`: a column of
  // the room, delivered inside `room` on join, patched here when the owner
  // moves it from the settings panel's Access tab during the session. There
  // is no socket event for it (see #225), so this only tracks the change in
  // the tab that made it — enough for what reads it, which is the warning on
  // the Share menu item.
  setRoomAccessMode: (accessMode: RoomAccessMode) => void
  // (#548) The room's toolset — another column of the room, arriving inside
  // `room` on join. Unlike `accessMode` this one *does* have a socket event
  // (`room_tools_changed`), because it has to reach every participant the
  // moment the owner changes it: a teacher taking the eraser off the desk
  // mid-lesson is not a setting that can wait for everyone to reload.
  //
  // `undefined` = the room offers everything; see `sanitizeEnabledTools`.
  setRoomEnabledTools: (enabledTools: ToggleableTool[] | undefined) => void

  // ── Boards (#176, ADR 014 §4) ──────────────────────────────────────────
  // The lesson is the social unit — one socket, one roster, one strip — and
  // the board is the content unit: the engine, the outbox and the snapshot
  // load all key on `boardId`. All of this survives `resetBoardState()`
  // (a page turn) and dies with `resetRoomStore()` (entering a lesson).

  /** The lesson this session is in; null until the first `room_state`. For a
   *  lesson with one board it equals `room.id`. What every lesson-level REST
   *  call (access, rename, close, boards) is addressed to. */
  lessonId: string | null
  /** The board whose content the engine holds or is loading — set exactly
   *  when that board's `room_state` arrives (see Room/index.tsx's
   *  handleRoomState), never ahead of it, so an engine keyed on this is never
   *  built for a board the server has not seated us on. Null until then. */
  boardId: string | null
  /** The strip, in `order`. The lesson's own board is the first entry, under
   *  the lesson's id. */
  boards: BoardSummary[]
  /** The teacher's board; null means the lesson's own first board (the same
   *  spelling the wire uses — see `Room.activeBoardId`). */
  activeBoardId: string | null
  /** Whether this client turns the page when the teacher does. On by
   *  default; a hand-picked board turns it off, the "teacher is on …" chip
   *  turns it back on. Meaningless for the owner — they never follow —
   *  which is why it is stored raw and combined with `isOwner` at the read
   *  site (see `followTarget` in lib/boards/boards.ts). */
  following: boolean
  /** From `room_state.lesson`, on every join and reconnect. */
  setLesson: (lesson: LessonState) => void
  setBoardId: (boardId: string | null) => void
  setActiveBoardId: (boardId: string | null) => void
  setFollowing: (following: boolean) => void
  applyBoardsAction: (action: BoardsAction) => void

  // ── Class mode (#595, ADR 015 §6) ───────────────────────────────────────
  // All of it arrives whole in `room_state.lesson` / `lesson_state`, built by
  // the server for this person — so `boards` above already holds exactly the
  // personal boards this client may see, and nothing here filters for
  // privacy. Survives a page turn like the rest of this slice.

  /** Every assignment round of the lesson, in order. */
  assignments: AssignmentSummary[]
  /** The round in progress; null when there is none. */
  activeAssignmentId: string | null
  /** The personal board the teacher is showing everyone; null when none. */
  spotlightBoardId: string | null
  classVisibility: ClassVisibility
  /** Who has a hand up, by userId. */
  handsRaised: string[]
  setHandRaised: (userId: string, raised: boolean) => void
}

export const createRoomInfoSlice: StateCreator<RoomInfoSlice> = set => ({
  room: null,
  setRoomInfo: info => set({ room: info }),
  participants: [],
  applyParticipantAction: action => set(state => ({
    participants: participantsReducer(state.participants, action),
  })),
  // Matches Room's own former INITIAL_USER_ID placeholder, used until the
  // socket's create_room/join_room ack hands back the server-resolved
  // identity (#41) — see applyIdentity in Room/index.tsx.
  userId: 'local',
  setUserId: id => set({ userId: id }),
  palette: [],
  setPalette: palette => set({ palette }),
  roomFrozen: false,
  setRoomFrozen: frozen => set({ roomFrozen: frozen }),
  setRoomName: name => set(state => (
    state.room ? { room: { ...state.room, name } } : {}
  )),
  setRoomClosedAt: closedAt => set(state => (
    state.room ? { room: { ...state.room, closedAt: closedAt ?? undefined } } : {}
  )),
  setRoomAccessMode: accessMode => set(state => (
    state.room ? { room: { ...state.room, accessMode } } : {}
  )),
  setRoomEnabledTools: enabledTools => set(state => (
    state.room ? { room: { ...state.room, enabledTools } } : {}
  )),
  lessonId: null,
  boardId: null,
  boards: [],
  activeBoardId: null,
  following: true,
  setLesson: lesson => set({
    lessonId: lesson.id, boards: sortBoards(lesson.boards), activeBoardId: lesson.activeBoardId,
    assignments: lesson.assignments, activeAssignmentId: lesson.activeAssignmentId,
    spotlightBoardId: lesson.spotlightBoardId, classVisibility: lesson.classVisibility,
    handsRaised: lesson.handsRaised,
  }),
  setBoardId: boardId => set({ boardId }),
  setActiveBoardId: activeBoardId => set({ activeBoardId }),
  setFollowing: following => set({ following }),
  applyBoardsAction: action => set(state => ({ boards: boardsReducer(state.boards, action) })),
  assignments: [],
  activeAssignmentId: null,
  spotlightBoardId: null,
  classVisibility: 'teacher_only',
  handsRaised: [],
  setHandRaised: (userId, raised) => set(state => {
    const has = state.handsRaised.includes(userId)
    if (has === raised) return {}
    return { handsRaised: raised ? [...state.handsRaised, userId] : state.handsRaised.filter(id => id !== userId) }
  }),
})

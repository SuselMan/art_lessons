import type { StateCreator } from 'zustand'
import type { Participant, RoomAccessMode } from '@grafetto/shared'

import { participantsReducer, type ParticipantsAction } from '../../pages/Room/participants'
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
})

import type { StateCreator } from 'zustand'
import type { Participant } from '@art-lessons/shared'

import { participantsReducer, type ParticipantsAction } from '../../pages/Room/participants'

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
  paper: 'rough' | 'smooth' | 'bristol'
  // Hex color the creator picked for the paper background — see the shared
  // `Room.paperColor` doc comment. Absent on rooms created before this field
  // existed; the engine falls back to its own per-texture default then.
  paperColor?: string
  infinite: boolean
  width: number
  height: number
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
})

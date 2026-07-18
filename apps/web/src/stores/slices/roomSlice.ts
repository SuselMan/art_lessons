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
})

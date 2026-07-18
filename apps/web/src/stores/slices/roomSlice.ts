import type { StateCreator } from 'zustand'
import type { Participant } from '@art-lessons/shared'

import { participantsReducer, type ParticipantsAction } from '../../pages/Room/participants'

// Skeleton only (#20) — this is the spec's vaguest bucket ("room: id, name,
// participants, local userId"). Real wiring (absorbing Room's `config`/
// `configRef`, deciding whether `userId` needs to be a reactive field at
// all given it has zero current reactive consumers) is deferred to #24,
// the final sweep — folding it in there since the original task spec never
// gave "room" its own dedicated migration issue the way layerState/
// viewport/tool each got.
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
  userId: '',
  setUserId: id => set({ userId: id }),
})

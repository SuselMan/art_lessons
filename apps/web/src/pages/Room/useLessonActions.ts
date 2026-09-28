import { useCallback, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Socket } from 'socket.io-client'

import type { ClientToServerEvents, ServerToClientEvents, ToggleableTool } from '@grafetto/shared'

import { useConfirmDialog } from '../../components/ConfirmDialog/useConfirmDialog'
import { useT } from '../../i18n'
import { forkRoom, setRoomClosed } from '../../lib/api/api'
import { useRoomStore } from '../../stores/roomStore'

export interface LessonActionsDeps {
  socketRef: RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null>
  /** The room in the URL — the board a copy is taken of. */
  roomId: string | undefined
  /** The lesson it belongs to — what is closed and reopened (#176). */
  lessonId: string | undefined
}

/** (#493) What the owner switches on a live lesson — the room freeze, one
 *  participant's freeze, the toolset — and the two ways out of a closed one:
 *  reopening it, or taking a copy to work in. None of them is optimistic; the
 *  server is the only writer and its answer is what the store shows. Out of
 *  Room with lessonControls.spec.ts written first. */
export function useLessonActions({ socketRef, roomId, lessonId }: LessonActionsDeps) {
  const t = useT()
  const navigate = useNavigate()
  const { alert: showAlert } = useConfirmDialog()
  const roomName = useRoomStore(s => s.room?.name)

  // (#254/#256/#259) Optimistic-free, same as palette add/remove (useToolColor) — the
  // server is the only writer of `roomFrozen` (via room_frozen_changed);
  // this just requests the change. socketHandlers.ts rejects the request
  // outright for a non-owner, so wiring the button to always be callable
  // here is safe (the header button itself is also only rendered for the
  // owner — see the render section below — this stays defensive either way).
  const toggleRoomFrozen = useCallback(() => {
    socketRef.current?.emit('set_room_frozen', !useRoomStore.getState().roomFrozen)
  }, [socketRef])
  // (#548) Same shape as the freeze toggle above and for the same reason: the
  // server is the only writer, and it broadcasts the result back to everyone
  // (`room_tools_changed`) including this tab. So nothing is patched locally
  // here — an optimistic update would only be a second opinion about a value
  // the server sanitizes anyway.
  const setRoomTools = useCallback((next: ToggleableTool[] | undefined) => {
    socketRef.current?.emit('set_room_tools', next)
  }, [socketRef])
  // (#222) Reopening from inside the room. Unlike the freeze toggles around
  // it this goes over REST, because closing is persisted and the same call
  // has to work from the lesson list where there is no socket for the room
  // (see roomRoutes.ts). The store is patched from the answer rather than
  // waiting for the server's own `room_closed_changed` broadcast to come
  // back: the broadcast is what tells *everyone else*, and relying on it
  // here would leave the person who pressed the button looking at a room
  // that is still closed if their socket happens to be down.
  const [closedBusy, setClosedBusy] = useState(false)
  const reopenRoom = useCallback(async () => {
    if (!lessonId) return
    setClosedBusy(true)
    try {
      const updated = await setRoomClosed(lessonId, false)
      useRoomStore.getState().setRoomClosedAt(updated.closedAt ?? null)
    } catch {
      void showAlert({ message: t('room.error.reopen') })
    } finally {
      setClosedBusy(false)
    }
  }, [lessonId, showAlert, t])
  // (#222/#317) The student half: a closed lesson is homework, and this is
  // how it gets taken. Navigates *into* the copy — the opposite of the same
  // action in the lesson list (#317), and for the opposite reason: there the
  // point is to hand copies out, here the point is to start working.
  const takeRoomCopy = useCallback(async () => {
    if (!roomId) return
    setClosedBusy(true)
    try {
      const { room: copy } = await forkRoom(roomId, { name: t('lessons.forkedName', { name: roomName ?? '' }), scope: 'board' })
      navigate(`/room/${copy.id}`)
    } catch {
      void showAlert({ message: t('room.error.takeCopy') })
      setClosedBusy(false)
    }
  }, [roomId, navigate, roomName, showAlert, t])
  // (#254/#257/#259) Same reasoning as toggleRoomFrozen above, targeted at
  // one participant — passed to ParticipantsPanel's onToggleFreeze.
  const toggleParticipantFrozen = useCallback((userId: string, frozen: boolean) => {
    socketRef.current?.emit('set_participant_frozen', { userId, frozen })
  }, [socketRef])

  return { toggleRoomFrozen, setRoomTools, closedBusy, reopenRoom, takeRoomCopy, toggleParticipantFrozen }
}

import type { RefObject } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import type { ServerToClientEvents } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../../engine'
import type { TFunction } from '../../../i18n'
import { notifyError } from '../../../stores/noticeStore'
import { useRoomStore } from '../../../stores/roomStore'
import type { JoinGateState } from '../status/JoinGate'
import { applyJoinRequestCreated, applyJoinRequestResolved } from './joinQueue'

export type RoomControlEventHandlers = Pick<ServerToClientEvents,
  | 'palette_updated' | 'room_frozen_changed' | 'room_tools_changed' | 'room_closed_changed'
  | 'participant_frozen_changed' | 'join_request_resolved' | 'join_request_created' | 'kicked'>

export interface RoomControlEventDeps {
  engineRef: RefObject<Pick<PencilEngineAPI, 'endPeerLiveStroke'> | null>
  requestFullResync: () => void
  /** The id this socket was opened for — the lesson's until the first
   *  room_state says otherwise. */
  sessionId: string
  queryClient: QueryClient
  /** Whether this client is inside the room, as opposed to on its join gate. */
  hasJoinedRef: RefObject<boolean>
  /** Finishes the join the gate was refused, with the credentials last tried. */
  retryJoinRef: RefObject<() => void>
  setJoinState: (state: JoinGateState) => void
  tRef: RefObject<TFunction>
}

/** (#493) What the room's owner decides, as it reaches everyone on the socket:
 *  the palette, freezes, the offered tools, closing for editing (#222, #254,
 *  #548), and the join queue — someone asking in, the answer, being removed
 *  (#227, #231, #380).
 *
 *  Out of Room's socket effect; handlers come back rather than a
 *  registration, for the same reason as createBoardEventHandlers. */
export function createRoomControlEventHandlers({
  sessionId, queryClient, hasJoinedRef, retryJoinRef, setJoinState, tRef, engineRef, requestFullResync,
}: RoomControlEventDeps): RoomControlEventHandlers {
  // (#699) Blocking ends the possibility of an outstanding gesture being
  // accepted. Like a peer leaving mid-stroke, live ink without a log record
  // needs the existing authoritative catch-up; pen-up alone cannot fix it.
  const repairBlockedLiveInk = (userIds: readonly string[]) => {
    const orphaned = userIds.reduce((n, id) => n + (engineRef.current?.endPeerLiveStroke(id) ?? 0), 0)
    if (orphaned > 0) requestFullResync()
  }
  const repairAllBlockedLiveInk = () => repairBlockedLiveInk(useRoomStore.getState().participants.map(p => p.userId))

  return {
    palette_updated: ({ palette }) => {
      useRoomStore.getState().setPalette(palette)
    },

    // (#254/#256/#259) Room-wide freeze toggled by the owner — broadcast to
    // everyone including the owner themselves (io.to, see socketHandlers.ts),
    // so this fires for the owner's own toggle too, same as palette_updated
    // above.
    room_frozen_changed: ({ frozen }) => {
      useRoomStore.getState().setRoomFrozen(frozen)
      if (frozen) repairAllBlockedLiveInk()
    },

    // (#548) The owner changed which tools this room offers. Broadcast to
    // everyone including them, because the effect is local and immediate on
    // every screen: the buttons go, and a hand holding one of the withdrawn
    // tools has to be given something else (see the effect near selectTool).
    room_tools_changed: ({ enabledTools: next }) => {
      useRoomStore.getState().setRoomEnabledTools(next)
    },

    // (#222) Closed-for-editing toggled by the owner, from here or from the
    // lesson list. The point of the event is that someone mid-lesson finds
    // out when it happens rather than on the rejection of their next stroke.
    room_closed_changed: ({ closedAt }) => {
      useRoomStore.getState().setRoomClosedAt(closedAt)
      if (closedAt) repairAllBlockedLiveInk()
    },

    // (#254/#257/#259) One participant's freeze toggled — broadcast to the
    // whole room so ParticipantsPanel can show the indicator for everyone,
    // not just the target themselves.
    participant_frozen_changed: ({ userId, frozen }) => {
      useRoomStore.getState().applyParticipantAction({ type: 'participant_frozen_changed', userId, frozen })
      if (frozen) repairBlockedLiveInk([userId])
    },

    // (#227/#231) The owner answered someone waiting on the join screen. On
    // approval the gate finishes the join it was refused — the person is
    // already sitting in front of the screen, and making them press a button
    // to accept being let in would be asking them to confirm the thing they
    // asked for. A denial just changes what the screen says; the server lets
    // them ask again, and the screen offers exactly that.
    //
    // Never restarts the join once we're in: the room is already open, and a
    // stale resolution arriving after a reconnect must not re-enter it.
    join_request_resolved: ({ roomId, requestId, approved }) => {
      // Already inside: this is not about us being let in — it is either the
      // owner hearing a decision made elsewhere (#387: a second tab, the
      // lesson list, an invite that approved someone already queued), or a
      // stale resolution arriving after a reconnect. Neither may restart the
      // join; the owner's queue just loses that one row.
      if (hasJoinedRef.current) {
        // (#176) Addressed by the lesson (the queue is the lesson's), which the
        // URL id may not be until the first room_state corrected it.
        if (roomId === (useRoomStore.getState().lessonId ?? sessionId)) {
          applyJoinRequestResolved(queryClient, roomId, requestId)
        }
        return
      }
      if (approved) retryJoinRef.current()
      else setJoinState('denied')
    },

    // (#380/#227) Someone is asking to be let in. Addressed to the owner
    // personally, so this only ever fires for them — and it is what makes the
    // waiting section (and the participants tab's badge) appear mid-lesson
    // without anyone having gone looking for it.
    join_request_created: ({ roomId, request }) => {
      applyJoinRequestCreated(queryClient, roomId, request)
    },

    // (#227) Removed from this room while sitting in it. The server has
    // already taken this socket out of the room, so nothing sent from here
    // will be accepted from now on — say so, rather than letting the next
    // stroke fail as an unexplained sync error.
    //
    // Deliberately does not close the editor or navigate: what should happen
    // to the canvas someone is looking at when they lose access to it — and
    // to whatever they had not finished sending — is its own decision, not
    // one to make silently inside an event handler. The notice is the part
    // that is unambiguous.
    kicked: () => {
      hasJoinedRef.current = false
      notifyError(tRef.current('room.kicked'), { key: 'kicked', durationMs: null })
    },
  }
}

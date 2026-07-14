import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type { Participant, CursorMoveData, ClientToServerEvents, ServerToClientEvents } from '@art-lessons/shared'
import styles from './Room.module.css'

export interface PeerCursorPosition {
  userId: string
  // Canvas physical-pixel space for bounded rooms (same coordinate system
  // as `Dab.x/y`); genuine world space for infinite rooms (#143 — same
  // convention `Dab.x/y`/`getContentBounds` use there instead) — see
  // Room's #37 cursor-broadcast effect (`clientToRoomPoint`), which is
  // what actually produces these before they ever reach this component.
  x: number
  y: number
}

interface PeerCursorsProps {
  // (#152) The raw socket, not a `cursors` array computed by Room — see the
  // effect below for why: cursor *position* state now lives entirely inside
  // this component instead of Room's own state, so a burst of peer_cursor
  // packets (up to ~30Hz per moving peer, summed across however many peers)
  // only ever reconciles this small marker layer, never Room's whole
  // ~1600-line tree. Null before the socket connects — nothing to subscribe
  // to yet, same as before any cursor had ever arrived.
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null
  participants: Participant[]
  zoom: number
  angle: number
}

/** Renders other participants' cursors as labeled dots over the canvas.
 *
 *  Bounded rooms: placed as a sibling of the `<canvas>` inside the same
 *  `canvasWrap` div that already carries the viewport's CSS transform
 *  (`translate(cx,cy) rotate(angle) scale(zoom) translate(-w/2,-h/2)`, see
 *  `useViewport`/`Room`). Positioning a marker at raw canvas-pixel (x, y)
 *  inside that transformed parent therefore automatically follows pan/zoom/
 *  rotation — no separate inverse-transform math needed here, it's the same
 *  coordinate space `PointerInput` already normalizes local pointer input
 *  into (see `engine.on('pointer', ...)`).
 *
 *  Infinite rooms (#143): placed instead inside Room's `.worldOverlayWrap`,
 *  a sibling wrapper carrying the equivalent camera transform
 *  (`cameraTransformCss` in `cameraMath.ts`) — there is no CSS transform on
 *  `canvasWrap` itself to lean on there (see that component's own
 *  docstring). Same component, same markup, same (x, y)-in-a-transformed-
 *  ancestor trick either way; only which ancestor supplies the transform,
 *  and what convention (x, y) is expressed in, differs.
 *
 *  Either way, each marker counter-scales/rotates itself so the dot/label
 *  stay a constant screen size and upright regardless of the local
 *  viewer's zoom/rotation.
 *
 *  (#152) Owns its own cursor-position state and subscribes to the socket
 *  directly (peer_cursor for updates, peer_left for cleanup) instead of
 *  receiving a `cursors` array Room computed from its own state — the same
 *  "ref/local-state-driven, bypass the big component's reconciliation"
 *  philosophy #126 already established for the local viewport, applied here
 *  to peer cursors. Room still owns `participants` (name/color lookup,
 *  changes rarely — join/leave, not per cursor-move) and passes it as an
 *  ordinary prop. */
export function PeerCursors({ socket, participants, zoom, angle }: PeerCursorsProps) {
  const [cursors, setCursors] = useState<Record<string, PeerCursorPosition>>({})

  useEffect(() => {
    if (!socket) return
    const handleCursor = (data: CursorMoveData & { userId: string }) => {
      const { userId: peerId, x, y, drawing } = data
      // Frozen while they're mid-stroke (#37 follow-up v2) — the dot stays
      // put at wherever it last was until the finished stroke reveals, since
      // there's no live approximation of the in-progress shape any more.
      if (drawing) return
      setCursors(prev => ({ ...prev, [peerId]: { userId: peerId, x, y } }))
    }
    const handleLeft = (leftUserId: string) => {
      setCursors(prev => {
        if (!(leftUserId in prev)) return prev
        const next = { ...prev }
        delete next[leftUserId]
        return next
      })
    }
    socket.on('peer_cursor', handleCursor)
    socket.on('peer_left', handleLeft)
    return () => {
      socket.off('peer_cursor', handleCursor)
      socket.off('peer_left', handleLeft)
    }
  }, [socket])

  const cursorList = Object.values(cursors)
  if (!cursorList.length) return null
  const byId = new Map(participants.map(p => [p.userId, p]))
  const counterScale = 1 / (zoom || 1)

  return (
    <div className={styles.cursorLayer}>
      {cursorList.map(({ userId, x, y }) => {
        const participant = byId.get(userId)
        if (!participant) return null
        return (
          <div
            key={userId}
            className={styles.cursorMarker}
            style={{ transform: `translate(${x}px, ${y}px) scale(${counterScale}) rotate(${-angle}rad)` }}
          >
            <div className={styles.cursorDot} style={{ background: participant.color }} />
            <div className={styles.cursorLabel} style={{ background: participant.color }}>
              {participant.name}
            </div>
          </div>
        )
      })}
    </div>
  )
}

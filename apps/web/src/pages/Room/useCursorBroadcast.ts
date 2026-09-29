import { useEffect, useRef, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'

import { useRoomStore } from '../../stores/roomStore'
import { clientToRoomPoint } from './viewport/cameraMath'
import { shouldEmitCursor } from './net/cursorThrottle'

export interface CursorBroadcastInput {
  /** The viewport container. Pointer positions are measured against it. */
  vpRef: RefObject<HTMLDivElement | null>
  socketRef: RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null>
  /** Whether a stroke is currently under the pen — see the silence rule below. */
  strokeActiveRef: RefObject<boolean>
}

/** (#493) Telling peers where this person's cursor is.
 *
 *  A raw DOM listener rather than the engine's 'pointer' event: that one only
 *  fires while a stroke's pointer button is held (see PointerInput's `_active`
 *  gating), but peers should see the cursor while just hovering too.
 *
 *  Pen and mouse only, the same devices PointerInput accepts for drawing.
 *  Touch drives pan/pinch/rotate here (see useViewport), not pointing, so
 *  broadcasting it made a peer's cursor jump around whenever a finger touched
 *  down to pan while that peer was mid-gesture.
 *
 *  Reads the room and the viewport through the store and a ref rather than
 *  taking them as changing inputs, so the listener is not torn down and
 *  rebuilt on every pan and zoom. The one thing it does re-attach for is the
 *  room's configuration arriving, because until then there is nothing to
 *  convert coordinates against. */
export function useCursorBroadcast({ vpRef, socketRef, strokeActiveRef }: CursorBroadcastInput): void {
  const config = useRoomStore(s => s.room)
  // Lives here rather than in Room: nothing outside this listener has ever
  // read it, and a throttle's clock belongs to the thing being throttled.
  const lastSentRef = useRef(0)

  useEffect(() => {
    const el = vpRef.current
    if (!el || !config) return
    // (#155 follow-up) Cached rect, same forced-reflow reasoning as the
    // engine's own _getCanvasRect (see its doc comment) — getBoundingClientRect
    // is a synchronous layout read, and this handler runs on every real
    // pointermove reaching the viewport (throttled to shouldEmitCursor's own
    // rate for the *emit*, but the read itself ran unthrottled before this).
    // Invalidated only by a real resize of the viewport container itself —
    // panning/zooming/drawing never move or resize that element.
    let rectCache: DOMRect | null = null
    const observer = new ResizeObserver(() => { rectCache = null })
    observer.observe(el)

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      // (#431) Silent while the pen is down: the live stroke channel (#429) is
      // already reporting this exact position, dab by dab, to draw the ink
      // with. A cursor packet here would be a second, coarser answer to a
      // question already answered — and the two could disagree, which is the
      // whole failure that change exists to remove.
      if (strokeActiveRef.current) return
      const now = Date.now()
      if (!shouldEmitCursor(lastSentRef.current, now)) return
      lastSentRef.current = now
      const rect = rectCache ??= el.getBoundingClientRect()
      // #143: world-space for infinite rooms (clientToRoomPoint), matching
      // what getContentBounds/painted content already use there — so a peer's
      // PeerCursors marker (rendered through the same camera conversion) lands
      // on the actual world point the cursor is over, not wherever it happened
      // to be relative to an arbitrary placeholder canvas size.
      const { x, y } = clientToRoomPoint(e.clientX, e.clientY, rect, useRoomStore.getState().viewport, config)
      socketRef.current?.emit('cursor_move', { x, y })
    }

    el.addEventListener('pointermove', handleMove)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      observer.disconnect()
    }
  }, [config, vpRef, socketRef, strokeActiveRef])
}

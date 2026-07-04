import type { Participant } from '@art-lessons/shared'
import styles from './Room.module.css'

export interface PeerCursorPosition {
  userId: string
  x: number // canvas physical-pixel space — same coordinate system as `Dab.x/y`
  y: number
}

interface PeerCursorsProps {
  cursors: PeerCursorPosition[]
  participants: Participant[]
  zoom: number
  angle: number
}

/** Renders other participants' cursors as labeled dots over the canvas.
 *
 *  This is placed as a sibling of the `<canvas>` inside the same
 *  `canvasWrap` div that already carries the viewport's CSS transform
 *  (`translate(cx,cy) rotate(angle) scale(zoom) translate(-w/2,-h/2)`, see
 *  `useViewport`/`Room`). Positioning a marker at raw canvas-pixel (x, y)
 *  inside that transformed parent therefore automatically follows pan/zoom/
 *  rotation — no separate inverse-transform math needed here, it's the same
 *  coordinate space `PointerInput` already normalizes local pointer input
 *  into (see `engine.on('pointer', ...)`). Each marker counter-scales/
 *  rotates itself so the dot/label stay a constant screen size and upright
 *  regardless of the local viewer's zoom/rotation. */
export function PeerCursors({ cursors, participants, zoom, angle }: PeerCursorsProps) {
  if (!cursors.length) return null
  const byId = new Map(participants.map(p => [p.userId, p]))
  const counterScale = 1 / (zoom || 1)

  return (
    <div className={styles.cursorLayer}>
      {cursors.map(({ userId, x, y }) => {
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

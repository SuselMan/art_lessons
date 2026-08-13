import type { SelectionShape } from '@grafetto/shared'

import styles from './Room.module.css'

interface SelectionOverlayProps {
  /** The committed selection, or null when nothing is selected. */
  selection: SelectionShape | null
  /** The lasso currently being drawn, in the same layer coordinates — an open
   *  path, drawn while the gesture runs. */
  pending: number[] | null
  /** Where the pointer is right now, for the point-by-point lasso's rubber
   *  band between the last placed vertex and the cursor. Null for every other
   *  gesture and between gestures. */
  cursor: { x: number; y: number } | null
  /** Camera zoom, to counter-scale the outline. Without it the marching ants
   *  are drawn in *layer* units and become a hairline at 25% and a rope at
   *  400% — the same counter-transform TransformGizmo and PeerCursors apply,
   *  for the same reason. */
  zoom: number
}

/** (#446) Draws the selection: its outline, and the lasso in progress.
 *
 *  Purely presentational, like RulerOverlay and TransformGizmo — every
 *  pointer event that produces a selection is caught by Room's own catcher
 *  (see its selection gesture handlers), never here. That split is what lets
 *  the selection stay on screen under another tool without becoming draggable
 *  under it, which is exactly the trap #405 pulled the ruler out of.
 *
 *  Same placement convention as those two: a child of whichever ancestor
 *  carries the viewport transform (canvasWrap for bounded rooms, the world
 *  overlay for infinite ones), so drawing at raw layer coordinates tracks
 *  pan/zoom/rotate with no inverse math here.
 *
 *  The outline is two coincident strokes — a solid light one under a dashed
 *  dark one — rather than one dashed line: a single colour disappears against
 *  either white paper or dark graphite depending on where the boundary falls,
 *  and a selection you cannot see is worse than no indicator at all. */
export function SelectionOverlay({ selection, pending, cursor, zoom }: SelectionOverlayProps) {
  const scale = 1 / (zoom || 1)
  const committed = selection ? toPolygonPoints(selection.points) : null
  const inProgress = pending && pending.length >= 4 ? toPolygonPoints(pending) : null
  const lastX = pending && pending.length >= 2 ? pending[pending.length - 2] : null
  const lastY = pending && pending.length >= 2 ? pending[pending.length - 1] : null

  if (!committed && !inProgress && lastX === null) return null

  return (
    <svg className={styles.selectionSvg}>
      {committed && (
        <>
          <polygon points={committed} className={styles.selectionOutlineBack} strokeWidth={2 * scale} />
          <polygon
            points={committed} className={styles.selectionOutlineFront}
            strokeWidth={1.5 * scale} strokeDasharray={`${6 * scale} ${4 * scale}`}
          />
        </>
      )}
      {inProgress && (
        <polyline
          points={inProgress} className={styles.selectionPending}
          strokeWidth={1.5 * scale} strokeDasharray={`${5 * scale} ${3 * scale}`}
        />
      )}
      {/* The rubber band: from the last placed vertex to the pointer, so a
          point-by-point lasso shows the segment it is about to commit. */}
      {cursor && lastX !== null && lastY !== null && (
        <line
          x1={lastX} y1={lastY} x2={cursor.x} y2={cursor.y}
          className={styles.selectionPending}
          strokeWidth={1.5 * scale} strokeDasharray={`${5 * scale} ${3 * scale}`}
        />
      )}
    </svg>
  )
}

function toPolygonPoints(flat: number[]): string {
  const parts: string[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) parts.push(`${flat[i]},${flat[i + 1]}`)
  return parts.join(' ')
}

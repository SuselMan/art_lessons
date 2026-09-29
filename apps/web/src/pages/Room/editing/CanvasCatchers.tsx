import type { PointerEvent, RefObject } from 'react'

import { useRoomStore } from '../../../stores/roomStore'
import styles from '../Room.module.css'

type Press = (e: PointerEvent<HTMLDivElement>) => void

export interface CanvasCatchersProps {
  onEyedropperPick: Press
  fill: { busy: boolean; onTap: Press }
  ruler: { onDown: Press; onHover: Press; onEnter: () => void }
  selection: { onDown: Press; onHover: Press; onDoubleClick: () => void; onEnter: () => void }
  annotation: {
    textCatcherRef: RefObject<HTMLDivElement | null>
    hover: boolean
    setHover: (hover: boolean) => void
    onTextTap: Press
    onHover: Press
    onPenDown: Press
    onEraseDown: Press
  }
}

/** (#405, #493) One transparent surface over the canvas per tool whose gesture
 *  is a press on the canvas itself — mounted exactly while that tool is in
 *  hand, so whatever it left on screen under the pencil (a line, an outline, a
 *  note) is a mark and nothing more. Only one tool is ever in hand, so at most
 *  one of these exists. The gestures are the tools' own hooks; this is only
 *  where they meet the pointer. */
export function CanvasCatchers({ onEyedropperPick, fill, ruler, selection, annotation }: CanvasCatchersProps) {
  const tool = useRoomStore(s => s.tool)
  return (
    <>
      {/* (#405) The ruler's catcher is armed for as long as the tool is
          selected — laying a new line and grabbing the existing one are the
          same surface now, told apart per press by rulerGestureAt — where
          it used to disappear the moment a line existed. (#445) That is
          also exactly when the ruler is on screen, so nothing invisible is
          ever grabbable: off screen means inert, the same rule that keeps
          it from snapping. */}
      {tool === 'eyedropper' && (
        <div className={styles.canvasCatcher} onPointerDown={onEyedropperPick} />
      )}
      {/* (#453) A tap, like the eyedropper's — but unlike it the tool stays in
          hand afterwards: filling one region of a drawing almost always means
          filling the next one too. `pointerEvents: none` while a
          fill is running is what refuses the second tap, and it refuses it
          at the surface rather than inside the handler so the cursor says
          so too. */}
      {tool === 'fill' && (
        <div
          className={styles.canvasCatcher}
          style={fill.busy ? { cursor: 'progress' } : undefined}
          onPointerDown={fill.onTap}
        />
      )}
      {tool === 'ruler' && (
        <div
          className={styles.canvasCatcher}
          onPointerDown={ruler.onDown}
          onPointerMove={ruler.onHover}
          onPointerEnter={ruler.onEnter}
        />
      )}
      {/* (#446) Same pattern: mounted only while the selection tool is in
          hand, so a selection left on screen under the pencil is an
          outline and nothing more. */}
      {tool === 'selection' && (
        <div
          className={styles.canvasCatcher}
          onPointerDown={selection.onDown}
          onPointerMove={selection.onHover}
          onDoubleClick={selection.onDoubleClick}
          onPointerEnter={selection.onEnter}
        />
      )}
      {/* (#509/#510) The same pattern once more, and the same rule: the
          catcher exists exactly while its tool is in hand, so annotations
          left on screen under the pencil are marks and nothing more.

          Ordered under the overlay in the DOM but above it in effect —
          a press on an editable note hits the note's own handler first
          (it stops propagation), and everything that misses one lands
          here and starts a new one. */}
      {tool === 'annotateText' && (
        <div
          ref={annotation.textCatcherRef}
          className={styles.canvasCatcher}
          style={annotation.hover ? { cursor: 'pointer' } : undefined}
          onPointerDown={annotation.onTextTap}
          onPointerMove={annotation.onHover}
          onPointerLeave={() => annotation.setHover(false)}
        />
      )}
      {tool === 'annotatePen' && (
        <div className={styles.canvasCatcher} onPointerDown={annotation.onPenDown} />
      )}
      {tool === 'annotateEraser' && (
        <div
          className={styles.canvasCatcher}
          style={annotation.hover ? { cursor: 'pointer' } : undefined}
          onPointerDown={annotation.onEraseDown}
          onPointerMove={annotation.onHover}
          onPointerLeave={() => annotation.setHover(false)}
        />
      )}
    </>
  )
}

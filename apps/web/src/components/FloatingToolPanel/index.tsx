import { useCallback } from 'react'
import clsx from 'clsx'

import { useDraggablePosition } from '../../lib/useDraggablePosition'
import { Icon } from '../Icon'
import { clampPanelPosition, savePanelPosition, type PanelPosition } from '../../pages/Room/panelPosition'
import styles from './FloatingToolPanel.module.css'

// Diameter in CSS px — must match FloatingToolPanel.module.css's .panel
// width/height (no shared source of truth possible across TS/CSS; keep the
// two in sync by hand if either changes).
const PANEL_SIZE = 128

const PANEL_DOM_ID = 'floating-tool-panel'

interface Props {
  tool: 'pencil' | 'eraser'
  onSetTool: (tool: 'pencil' | 'eraser') => void
  onUndo: () => void
  onRedo: () => void
  roomId: string
  position: PanelPosition | null
  onPositionChange: (position: PanelPosition) => void
  /** Bounds the drag/clamp against — the editor root, same element the
   *  panel itself is positioned absolute within. */
  containerRef: React.RefObject<HTMLElement | null>
  hidden?: boolean
  strokeBlocked?: boolean
}

/** First minimal iteration of a "floating" UI cluster (#157) — a draggable
 *  circular panel with the 4 most-reached-for actions (undo/redo/pencil/
 *  eraser), independent of the existing header/left-toolbar (both stay as
 *  they are). Position persists per room (see panelPosition.ts) so it
 *  doesn't reset to a default corner on every visit once someone's moved
 *  it somewhere that suits their hand/device. */
export function FloatingToolPanel({
  tool, onSetTool, onUndo, onRedo, roomId, position, onPositionChange, containerRef, hidden, strokeBlocked,
}: Props) {
  const clamp = useCallback((pos: PanelPosition): PanelPosition => {
    const container = containerRef.current
    const size = container
      ? { width: container.clientWidth, height: container.clientHeight }
      : { width: Infinity, height: Infinity }
    return clampPanelPosition(pos, size, PANEL_SIZE)
  }, [containerRef])

  // The drag hook needs a concrete starting position on every render, even
  // before the panel has ever been dragged (position === null, rendered at
  // its CSS-anchored default corner instead of an inline left/top). Measure
  // that default corner's actual on-screen position relative to the
  // container the first time it's needed (i.e. right as a drag begins) —
  // after that first drag, `position` is always concrete and this measuring
  // path is never hit again for this panel instance.
  const measureCurrentPosition = useCallback((): PanelPosition => {
    if (position) return position
    const el = document.getElementById(PANEL_DOM_ID)
    const container = containerRef.current
    if (el && container) {
      const panelRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      return { x: panelRect.left - containerRect.left, y: panelRect.top - containerRect.top }
    }
    return { x: 0, y: 0 }
  }, [position, containerRef])

  const handleChange = useCallback((pos: PanelPosition) => {
    onPositionChange(pos)
    savePanelPosition(localStorage, roomId, pos)
  }, [onPositionChange, roomId])

  const { onPointerDown } = useDraggablePosition(measureCurrentPosition(), { onChange: handleChange, clamp })

  return (
    <div
      id={PANEL_DOM_ID}
      className={clsx(
        styles.panel,
        !position && styles.panelDefaultCorner,
        hidden && styles.uiHidden,
        strokeBlocked && styles.strokeBlocked,
      )}
      style={position ? { left: position.x, top: position.y } : undefined}
      onPointerDown={onPointerDown}
      title="Drag to move"
    >
      <div className={styles.grip} />
      <button className={clsx(styles.btn, styles.btnTop)} onClick={onUndo} title="Undo  Ctrl+Z" aria-label="Undo">
        <Icon name="undo" />
      </button>
      <button className={clsx(styles.btn, styles.btnRight)} onClick={onRedo} title="Redo  Ctrl+Shift+Z" aria-label="Redo">
        <Icon name="redo" />
      </button>
      <button
        className={clsx(styles.btn, styles.btnLeft, tool === 'pencil' && styles.btnActive)}
        onClick={() => onSetTool('pencil')} title="Pencil" aria-label="Pencil"
      >
        <Icon name="edit" />
      </button>
      <button
        className={clsx(styles.btn, styles.btnBottom, tool === 'eraser' && styles.btnActive)}
        onClick={() => onSetTool('eraser')} title="Eraser" aria-label="Eraser"
      >
        <Icon name="ink_eraser" />
      </button>
    </div>
  )
}

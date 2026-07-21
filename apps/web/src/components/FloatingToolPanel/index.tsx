import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'

import { useDraggablePosition } from '../../lib/useDraggablePosition'
import { Icon } from '../Icon'
import { hexToRgb, rgbToHex } from '../../lib/color'
import { clampPanelPosition, savePanelPosition, type PanelPosition } from '../../pages/Room/panelPosition'
import { layoutFlyoutItems, type RayLayoutConfig } from './colorFlyout'
import styles from './FloatingToolPanel.module.css'

// Diameter in CSS px — must match FloatingToolPanel.module.css's .panel
// width/height (no shared source of truth possible across TS/CSS; keep the
// two in sync by hand if either changes).
const PANEL_SIZE = 152

const PANEL_DOM_ID = 'floating-tool-panel'

// Palette flyout (#190 follow-up) tuning constants — kept as plain numbers
// here, not a settings-panel toggle, so they're quick to hand-tune while
// figuring out what actually feels right on a real device.
// How many palette colors the flyout shows at once (plus one more slot for
// the "open full picker" button) — the full palette can be much bigger than
// this; it's still reachable via that button, so this only bounds how far
// the flyout ever has to grow, not how many colors exist.
const COLOR_FLYOUT_MAX = 32
const FLYOUT_SWATCH_SIZE = 40
const FLYOUT_GAP = 8
const FLYOUT_LAYOUT: RayLayoutConfig = {
  // Ring 1 sits just outside the *whole panel's* own edge (radius
  // PANEL_SIZE/2 = 76), not just the small center dot — orbiting the dot
  // alone put ring 1 uncomfortably close to it. Its circumference fits
  // around a dozen colors before ring 2 kicks in (see computeRayCount) —
  // COLOR_FLYOUT_MAX (32) colors spill into a few more rings further out.
  baseRadius: PANEL_SIZE / 2 + FLYOUT_GAP + FLYOUT_SWATCH_SIZE / 2,
  ringSpacing: FLYOUT_SWATCH_SIZE + 6,
  raySpacing: FLYOUT_SWATCH_SIZE + 6,
  swatchRadius: FLYOUT_SWATCH_SIZE / 2,
}

interface Props {
  /** Current actual tool, for the eraser button's own active-highlight —
   *  'pencil' | 'liner' here mean "not erasing", not literally which of the
   *  two is active (see primaryTool for that). */
  tool: 'pencil' | 'liner' | 'eraser'
  /** Last of pencil/liner actually selected (toolSlice.ts's
   *  lastDrawingTool) — drives the top button's icon/label and what it
   *  switches back to, so it reflects liner rather than assuming pencil. */
  primaryTool: 'pencil' | 'liner'
  onSetTool: (tool: 'pencil' | 'liner' | 'eraser') => void
  onUndo: () => void
  onRedo: () => void
  /** Current color of whichever tool primaryTool names, shown as the
   *  center dot — tap it to fan out the room palette (see the flyout state
   *  below). */
  primaryColor: [number, number, number]
  /** Room palette (#190) — the flyout shows up to COLOR_FLYOUT_MAX of these. */
  palette: string[]
  onSelectColor: (rgb: [number, number, number]) => void
  /** Tapping the flyout's picker button: show full UI + open the Color tab,
   *  same escape hatch as before this fan existed, for anything beyond the
   *  capped flyout (the rest of the palette, the full HSV picker, etc). */
  onOpenColorPicker: () => void
  roomId: string
  position: PanelPosition | null
  onPositionChange: (position: PanelPosition) => void
  /** Bounds the drag/clamp against — the editor root, same element the
   *  panel itself is positioned absolute within. */
  containerRef: React.RefObject<HTMLElement | null>
  /** True while #99's tap-to-hide minimal-UI mode is *inactive*, i.e. the
   *  full header/toolbar/side-panel chrome is showing — pass `!uiHidden`,
   *  not `uiHidden` (see this component's own doc comment for why the
   *  relationship is inverted from every other piece of chrome). */
  hidden?: boolean
  strokeBlocked?: boolean
  /** Hotkey hints for the Undo/Redo tooltips, formatted by the caller (see
   *  lib/hotkeys.ts's formatHotkeyLabel) — this component stays decoupled
   *  from the hotkeys registry itself, same as it already is for every
   *  other piece of Room state it's handed as props. */
  undoHotkeyLabel: string
  redoHotkeyLabel: string
}

/** First minimal iteration of a "floating" UI cluster (#157) — a draggable
 *  circular panel with the 4 most-reached-for actions (undo/redo/[primary
 *  drawing tool]/eraser), independent of the existing header/left-toolbar
 *  (both stay as they are). The top slot follows whichever of pencil/liner
 *  was last actually selected (primaryTool, #245 follow-up) rather than
 *  always pencil — there's still only one drawing-tool slot here, it just
 *  now shows the right one. Position persists per room (see
 *  panelPosition.ts) so it doesn't reset to a default corner on every visit
 *  once someone's moved it somewhere that suits their hand/device.
 *
 *  Visibility is the *inverse* of #99's tap-to-hide minimal-UI mode,
 *  opposite to every other piece of chrome (header/toolbar/side-panel):
 *  those fade away when minimal-UI is active; this panel only shows up
 *  then. It's the replacement minimal toolkit for that mode, not another
 *  thing minimal-UI hides — while the full chrome is showing, its own
 *  header Undo/Redo and toolbar pencil/eraser already cover the same
 *  actions, so this stays out of the way. A real consequence: with the
 *  experimental tapToHideUI flag off, uiHidden can never become true, so
 *  this panel never shows at all for that user — accepted for now (v1,
 *  same "further detail TBD" scope the issue itself calls out), not an
 *  oversight. */
export function FloatingToolPanel({
  tool, primaryTool, onSetTool, onUndo, onRedo, primaryColor, palette, onSelectColor, onOpenColorPicker,
  roomId, position, onPositionChange, containerRef, hidden, strokeBlocked,
  undoHotkeyLabel, redoHotkeyLabel,
}: Props) {
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  // Mount-then-transition: items first render collapsed onto the panel's
  // center (see the `animateIn` className below), then this flips true one
  // frame later so the CSS `transition: transform` on each item's own
  // .flyoutSwatch/.flyoutPickerBtn animates them out to their real
  // position — a plain CSS transition rather than a JS/rAF-driven
  // animation, per the "should render cheaply" ask. Double-rAF (not a
  // single one) because a single rAF can still land in the same paint as
  // the initial commit in some browsers, skipping the transition entirely.
  const [animateIn, setAnimateIn] = useState(false)
  const toggleFlyout = useCallback(() => setFlyoutOpen(o => !o), [])

  useEffect(() => {
    if (!flyoutOpen) { setAnimateIn(false); return }
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setAnimateIn(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [flyoutOpen])

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
    // A real drag (as opposed to a tap — see useDraggablePosition's own doc
    // comment on why onChange never fires for a plain tap) invalidates
    // whatever sector the flyout fanned out into, so close it rather than
    // leave it pointing at empty space relative to the panel's new spot.
    setFlyoutOpen(false)
    onPositionChange(pos)
    savePanelPosition(localStorage, roomId, pos)
  }, [onPositionChange, roomId])

  const { onPointerDown } = useDraggablePosition(measureCurrentPosition(), { onChange: handleChange, clamp })

  // Recomputed fresh each time the flyout opens (not continuously) — the
  // ray layout only matters at the moment it fans out; the panel's own
  // position effectively freezes for as long as the flyout stays open,
  // since handleChange above closes it the instant a real drag starts.
  const flyoutItems = useMemo(() => {
    if (!flyoutOpen) return []
    const container = containerRef.current
    const containerSize = container
      ? { width: container.clientWidth, height: container.clientHeight }
      : { width: Infinity, height: Infinity }
    const panelCenterPos = measureCurrentPosition()
    const panelCenter = { x: panelCenterPos.x + PANEL_SIZE / 2, y: panelCenterPos.y + PANEL_SIZE / 2 }
    const colors = palette.slice(0, COLOR_FLYOUT_MAX)
    const positions = layoutFlyoutItems(colors.length + 1, panelCenter, containerSize, FLYOUT_LAYOUT)
    return positions.map((pos, i) => ({
      ...pos,
      color: i === 0 ? null : colors[i - 1], // null marks the leading "open picker" slot
    }))
    // measureCurrentPosition changing (i.e. `position` changing) while
    // flyoutOpen is still true never actually happens in practice —
    // handleChange above flips flyoutOpen to false in the same call that
    // changes position — but it's cheap to recompute regardless (the guard
    // above bails immediately once flyoutOpen is false), so it's simplest to
    // just list it here rather than fight the linter over an invariant.
  }, [flyoutOpen, palette, containerRef, measureCurrentPosition])

  return (
    <>
      {/* Dismiss on a tap/click anywhere outside the panel — a real element
          covering the whole viewport (not a document-level listener)
          because it must physically intercept the tap before the canvas
          underneath ever sees it. Without this, closing the flyout and
          #99's tap-to-hide-UI toggle both fired off the same tap (the
          canvas's own pointerup, which useTapToggle listens for, doesn't
          care that some *other*, unrelated listener already reacted to the
          same gesture) — the first tap after opening the flyout would
          close it *and* immediately reveal the full chrome in the same
          motion. Sits below the panel (z-index) so its own buttons/flyout
          items stay reachable, above everything else since the flyout can
          only ever be open while the rest of the chrome is already hidden
          (see this component's own doc comment on the `hidden` prop). */}
      {flyoutOpen && (
        <div className={styles.flyoutBackdrop} onPointerDown={() => setFlyoutOpen(false)} />
      )}
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
        <button
          className={styles.colorDot}
          style={{ background: rgbToHex(primaryColor) }}
          onClick={toggleFlyout}
          title="Palette"
          aria-label={flyoutOpen ? 'Close palette' : 'Open palette'}
        />
        <button
          className={clsx(styles.btn, styles.btnTop, tool === primaryTool && styles.btnActive)}
          onClick={() => onSetTool(primaryTool)}
          title={primaryTool === 'liner' ? 'Liner' : 'Pencil'}
          aria-label={primaryTool === 'liner' ? 'Liner' : 'Pencil'}
        >
          <Icon name={primaryTool === 'liner' ? 'stylus' : 'edit'} />
        </button>
        <button className={clsx(styles.btn, styles.btnRight)} onClick={onRedo} title={`Redo  ${redoHotkeyLabel}`} aria-label="Redo">
          <Icon name="redo" />
        </button>
        <button className={clsx(styles.btn, styles.btnLeft)} onClick={onUndo} title={`Undo  ${undoHotkeyLabel}`} aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button
          className={clsx(styles.btn, styles.btnBottom, tool === 'eraser' && styles.btnActive)}
          onClick={() => onSetTool('eraser')} title="Eraser" aria-label="Eraser"
        >
          <Icon name="ink_eraser" />
        </button>

        {flyoutOpen && (
          <div className={styles.flyout}>
            {flyoutItems.map(item => {
              // Collapsed onto the panel's own center until animateIn flips
              // true one frame later (see the effect above) — that's the
              // "flies out from under the dot" motion, done as a CSS
              // transition rather than JS-driven.
              const offset = animateIn ? item : { x: 0, y: 0 }
              const transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`
              return item.color ? (
                <button
                  key={item.color}
                  className={styles.flyoutSwatch}
                  style={{ background: item.color, transform }}
                  title={item.color}
                  aria-label={`Select color ${item.color}`}
                  onClick={() => { onSelectColor(hexToRgb(item.color!)); setFlyoutOpen(false) }}
                />
              ) : (
                <button
                  key="open-picker"
                  className={styles.flyoutPickerBtn}
                  style={{ transform }}
                  title="Open color picker"
                  aria-label="Open color picker"
                  onClick={() => { onOpenColorPicker(); setFlyoutOpen(false) }}
                >
                  <Icon name="palette" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

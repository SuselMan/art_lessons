import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'

import { useDraggablePosition } from '../../lib/useDraggablePosition'
import { useLongPress } from '../../lib/useLongPress'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { hexToRgb, rgbToHex } from '../../lib/color'
import {
  clampPanelPosition, savePanelPosition, PANEL_SIZE, PANEL_DOM_ID, type PanelPosition,
} from '../../pages/Room/panelPosition'
import { layoutFlyoutItems, type RayLayoutConfig } from './colorFlyout'
import {
  FLOATING_PRIMARY_TOOLS, FLOATING_SECONDARY_TOOLS, TOOL_DISPLAY,
  type FloatingPanelTool, type FloatingPrimaryTool, type FloatingSecondaryTool,
} from './tools'
import styles from './FloatingToolPanel.module.css'

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
/** Which of the panel's three mutually-exclusive fans is out, if any: the
 *  palette under the color dot, and one per tool slot. One value rather than a
 *  boolean each because they all share the same annulus around the panel — two
 *  open at once would overlap item for item, and "close the others first" is a
 *  rule that only has to hold if the state lets it be broken. */
export type PanelFlyout = 'palette' | 'primary' | 'secondary'

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
  /** The tool actually in hand, or null while it is something neither slot can
   *  show (ruler, transform, grid, hand — all of which live in the full
   *  chrome). Drives which slot is lit, and nothing else: what each slot
   *  *displays* comes from the two fields below, which outlive the selection. */
  tool: FloatingPanelTool | null
  /** Last FloatingPrimaryTool actually selected (toolSlice.ts's
   *  lastDrawingTool, #252 follow-up: marker joined this slot the same way
   *  liner did, and charcoal in #304) — drives the top button's icon/label and
   *  what it switches back to, so it reflects whichever was really active
   *  rather than assuming pencil. */
  primaryTool: FloatingPrimaryTool
  /** The same thing for the bottom slot (toolSlice.ts's lastSecondaryTool):
   *  the eraser, the smudge or the eyedropper, whichever was last in hand. */
  secondaryTool: FloatingSecondaryTool
  onSetTool: (tool: FloatingPanelTool) => void
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
  /** Which fan is out, if any. Controlled from Room rather than kept local
   *  because the fans' rings share the exact annulus around this panel that
   *  ChiselAngleDial's ring lives in — Room hides that dial while this is
   *  non-null, so the two can never overlap. */
  flyout: PanelFlyout | null
  onFlyoutChange: (flyout: PanelFlyout | null) => void
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
 *  (both stay as they are). The top slot follows whichever of pencil/liner/
 *  marker was last actually selected (primaryTool, #245 follow-up; marker
 *  joined the same slot in a later follow-up) rather than always pencil —
 *  there's still only one drawing-tool slot here, it just now shows the
 *  right one. Position persists per room (see
 *  panelPosition.ts) so it doesn't reset to a default corner on every visit
 *  once someone's moved it somewhere that suits their hand/device.
 *
 *  When it is visible is the caller's decision, not this component's — it
 *  takes `hidden` and nothing else. Through #99 that decision was fixed: the
 *  panel was the *inverse* of minimal UI, appearing only once the header/
 *  toolbar/side-panel had faded away, because it was the replacement toolkit
 *  for that mode rather than another thing the mode hides. A real consequence
 *  was that anyone with minimal UI off never saw this panel at all.
 *
 *  (#321) That is now a setting — always / only in minimal UI / never (see
 *  lib/uiPreferences and Room's own use of it). "Always" means it can sit on
 *  top of the full chrome, duplicating the header's Undo/Redo and the
 *  toolbar's pencil/eraser: deliberate, since the point of the cluster is
 *  that it is wherever the hand already is.
 *
 *  Each tool slot is one slot but not one tool: holding it fans out the rest
 *  of its set to switch between them — the drawing tools from the top, the
 *  eraser/smudge/eyedropper from the bottom — using the same gesture and the
 *  same fan the color dot already had for the palette. That is what lets this
 *  panel stand in for the left toolbar rather than merely shortcut it: before
 *  it, swapping pencil for marker (or reaching the smudge at all) meant
 *  bringing the full chrome back, which is exactly what minimal UI was entered
 *  to be rid of. Tapping a slot still just selects what it already shows —
 *  except while that slot's own fan is out, when the tap tucks it back
 *  instead; only a press that goes the distance is taken away from the tap
 *  (useLongPress). See tapSlot for why the button that opened a fan is also
 *  the one that closes it. */
export function FloatingToolPanel({
  tool, primaryTool, secondaryTool, onSetTool, onUndo, onRedo, primaryColor, palette, onSelectColor,
  onOpenColorPicker, roomId, position, onPositionChange, containerRef, hidden,
  undoHotkeyLabel, redoHotkeyLabel, flyout, onFlyoutChange,
}: Props) {
  const t = useT()
  // Mount-then-transition: items first render collapsed onto the panel's
  // center (see the `animateIn` className below), then this flips true one
  // frame later so the CSS `transition: transform` on each item's own
  // .flyoutSwatch/.flyoutPickerBtn animates them out to their real
  // position — a plain CSS transition rather than a JS/rAF-driven
  // animation, per the "should render cheaply" ask. Double-rAF (not a
  // single one) because a single rAF can still land in the same paint as
  // the initial commit in some browsers, skipping the transition entirely.
  const [animateIn, setAnimateIn] = useState(false)
  const togglePalette = useCallback(
    () => onFlyoutChange(flyout === 'palette' ? null : 'palette'),
    [flyout, onFlyoutChange],
  )
  const openPrimaryFlyout = useCallback(() => onFlyoutChange('primary'), [onFlyoutChange])
  const openSecondaryFlyout = useCallback(() => onFlyoutChange('secondary'), [onFlyoutChange])
  const { onPointerDown: onPrimaryHold } = useLongPress({ onLongPress: openPrimaryFlyout })
  const { onPointerDown: onSecondaryHold } = useLongPress({ onLongPress: openSecondaryFlyout })

  // A tap on a tool slot. Selecting what the slot shows is only its second
  // job: while the slot's own fan is out, the tap tucks it back instead — the
  // same button opened it (by being held), so the same button is where a hand
  // reaches to undo that, and re-selecting the tool already showing on the
  // slot is a no-op that would leave the fan hanging. The fan is not a menu
  // that has to be chosen from: backing out of it is a real intention, and
  // the alternative was aiming at the backdrop instead.
  //
  // A tap on the *other* slot is an ordinary selection, and closes the fan on
  // the way — a fan left fanned out around a panel whose selection just moved
  // is pointing at a decision that has already been made.
  const tapSlot = useCallback((slot: PanelFlyout, slotTool: FloatingPanelTool) => {
    if (flyout === slot) { onFlyoutChange(null); return }
    if (flyout) onFlyoutChange(null)
    onSetTool(slotTool)
  }, [flyout, onFlyoutChange, onSetTool])

  // Reset to collapsed on *every* change of which fan is out, not just on
  // closing: swapping one fan straight for the other (holding the tool slot
  // while the palette is still open — the backdrop sits below the panel, so
  // its buttons stay live) would otherwise inherit the previous fan's
  // already-true animateIn and have the new items appear at full radius with
  // no motion at all.
  useEffect(() => {
    setAnimateIn(false)
    if (!flyout) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setAnimateIn(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [flyout])

  const clamp = useCallback((pos: PanelPosition): PanelPosition => {
    const container = containerRef.current
    const size = container
      ? { width: container.clientWidth, height: container.clientHeight }
      : { width: Infinity, height: Infinity }
    return clampPanelPosition(pos, size, PANEL_SIZE)
  }, [containerRef])

  // The same clamp, for the case where the *container* moves instead of the
  // panel: a device orientation flip resizes the editor root, and this panel
  // is pinned inside it in absolute px. Until this, the only clamp ran inside
  // a drag (the callback above, handed to useDraggablePosition), so nothing
  // ever re-checked a position that was in bounds when it was chosen — a panel
  // parked near the right edge in landscape simply sat outside the viewport in
  // portrait, out of reach of the drag that is the only way to bring it back.
  // Also covers opening a room whose stored position came from a bigger
  // screen: ResizeObserver delivers a first observation on observe(), so the
  // check runs once on mount too, which is what loadPanelPosition's "the
  // caller clamps against the current container size" comment always assumed
  // and never actually got.
  //
  // `position` is read through a ref rather than listed as a dependency:
  // onChange fires on every pointermove of a drag, and tearing down and
  // rebuilding an observer each frame — to watch a container size that cannot
  // change mid-drag — is pure churn.
  const positionRef = useRef(position)
  positionRef.current = position
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      const current = positionRef.current
      // Never dragged: the panel is at its CSS-anchored default corner, which
      // is laid out against the container and follows it by itself.
      if (!current) return
      const { clientWidth, clientHeight } = container
      // A container measuring zero (hidden, mid-teardown) would clamp the
      // panel to {0,0} and persist that — a bound we have no reason to trust.
      if (clientWidth === 0 || clientHeight === 0) return
      const next = clampPanelPosition(current, { width: clientWidth, height: clientHeight }, PANEL_SIZE)
      if (next.x === current.x && next.y === current.y) return
      // Same reasoning as handleChange below: the panel just moved, so any fan
      // still out is pointing along rays computed for where it used to be.
      onFlyoutChange(null)
      onPositionChange(next)
      savePanelPosition(localStorage, roomId, next)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, onFlyoutChange, onPositionChange, roomId])

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
    onFlyoutChange(null)
    onPositionChange(pos)
    savePanelPosition(localStorage, roomId, pos)
  }, [onFlyoutChange, onPositionChange, roomId])

  const { onPointerDown } = useDraggablePosition(measureCurrentPosition(), { onChange: handleChange, clamp })

  // Where `count` items land when fanned out around this panel, wherever it
  // currently sits in its container. Shared by both fans so the tools come out
  // along the exact same rays the colors do — one geometry, and in particular
  // one answer to "which directions are blocked by the nearest screen edge".
  const layoutAroundPanel = useCallback((count: number) => {
    const container = containerRef.current
    const containerSize = container
      ? { width: container.clientWidth, height: container.clientHeight }
      : { width: Infinity, height: Infinity }
    const panelCenterPos = measureCurrentPosition()
    const panelCenter = { x: panelCenterPos.x + PANEL_SIZE / 2, y: panelCenterPos.y + PANEL_SIZE / 2 }
    return layoutFlyoutItems(count, panelCenter, containerSize, FLYOUT_LAYOUT)
  }, [containerRef, measureCurrentPosition])

  // Both recomputed fresh each time their fan opens (not continuously) — the
  // ray layout only matters at the moment it fans out; the panel's own
  // position effectively freezes for as long as a fan stays open, since
  // handleChange above closes it the instant a real drag starts.
  //
  // measureCurrentPosition changing (i.e. `position` changing) while a fan is
  // still open never actually happens in practice — handleChange flips
  // `flyout` to null in the same call that changes position — but it's cheap
  // to recompute regardless (each guard below bails immediately once the fan
  // is closed), so it's simplest to just list it as a dependency rather than
  // fight the linter over an invariant.
  const paletteItems = useMemo(() => {
    if (flyout !== 'palette') return []
    const colors = palette.slice(0, COLOR_FLYOUT_MAX)
    return layoutAroundPanel(colors.length + 1).map((pos, i) => ({
      ...pos,
      color: i === 0 ? null : colors[i - 1], // null marks the leading "open picker" slot
    }))
  }, [flyout, palette, layoutAroundPanel])

  // One list either way — which slot was held only decides which set of tools
  // rides the rays, so the fan itself is written once (see the JSX below).
  const toolItems = useMemo(() => {
    if (flyout !== 'primary' && flyout !== 'secondary') return []
    const tools: readonly FloatingPanelTool[] =
      flyout === 'primary' ? FLOATING_PRIMARY_TOOLS : FLOATING_SECONDARY_TOOLS
    return layoutAroundPanel(tools.length).map((pos, i) => ({ ...pos, tool: tools[i] }))
  }, [flyout, layoutAroundPanel])

  // Collapsed onto the panel's own center until animateIn flips true one frame
  // later (see the effect above) — that's the "flies out from under the panel"
  // motion, done as a CSS transition rather than JS-driven.
  const itemTransform = useCallback((item: { x: number; y: number }) => {
    const offset = animateIn ? item : { x: 0, y: 0 }
    return `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`
  }, [animateIn])

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
      {flyout && (
        <div className={styles.flyoutBackdrop} onPointerDown={() => onFlyoutChange(null)} />
      )}
      <div
        id={PANEL_DOM_ID}
        className={clsx(
          styles.panel,
          !position && styles.panelDefaultCorner,
          hidden && styles.uiHidden,
          styles.strokeBlockable,
        )}
        style={position ? { left: position.x, top: position.y } : undefined}
        onPointerDown={onPointerDown}
        title={t('palette.dragPanel')}
      >
        <button
          className={styles.colorDot}
          style={{ background: rgbToHex(primaryColor) }}
          onClick={togglePalette}
          title={t('palette.open')}
          aria-label={t(flyout === 'palette' ? 'palette.closeLabel' : 'palette.openLabel')}
        />
        {/* Both tool slots: tap selects what the slot shows, hold fans out the
            rest of its set. The title says so, since a hold is the one gesture
            nothing on screen can advertise by itself. */}
        <button
          className={clsx(styles.btn, styles.btnTop, tool === primaryTool && styles.btnActive)}
          onClick={() => tapSlot('primary', primaryTool)}
          onPointerDown={onPrimaryHold}
          title={t('palette.toolHold', { tool: t(TOOL_DISPLAY[primaryTool].labelKey) })}
          aria-label={t(TOOL_DISPLAY[primaryTool].labelKey)}
        >
          <Icon name={TOOL_DISPLAY[primaryTool].icon} />
        </button>
        <button className={clsx(styles.btn, styles.btnRight)} onClick={onRedo} title={t('room.redoTitle', { hotkey: redoHotkeyLabel })} aria-label={t('room.redo')}>
          <Icon name="redo" />
        </button>
        <button className={clsx(styles.btn, styles.btnLeft)} onClick={onUndo} title={t('room.undoTitle', { hotkey: undoHotkeyLabel })} aria-label={t('room.undo')}>
          <Icon name="undo" />
        </button>
        <button
          className={clsx(styles.btn, styles.btnBottom, tool === secondaryTool && styles.btnActive)}
          onClick={() => tapSlot('secondary', secondaryTool)}
          onPointerDown={onSecondaryHold}
          title={t('palette.toolHold', { tool: t(TOOL_DISPLAY[secondaryTool].labelKey) })}
          aria-label={t(TOOL_DISPLAY[secondaryTool].labelKey)}
        >
          <Icon name={TOOL_DISPLAY[secondaryTool].icon} />
        </button>

        {flyout === 'palette' && (
          <div className={styles.flyout}>
            {paletteItems.map(item => (
              item.color ? (
                <button
                  key={item.color}
                  className={styles.flyoutSwatch}
                  style={{ background: item.color, transform: itemTransform(item) }}
                  title={item.color}
                  aria-label={t('palette.selectColor', { color: item.color })}
                  onClick={() => { onSelectColor(hexToRgb(item.color!)); onFlyoutChange(null) }}
                />
              ) : (
                <button
                  key="open-picker"
                  className={styles.flyoutPickerBtn}
                  style={{ transform: itemTransform(item) }}
                  title={t('palette.openPicker')}
                  aria-label={t('palette.openPicker')}
                  onClick={() => { onOpenColorPicker(); onFlyoutChange(null) }}
                >
                  <Icon name="palette" />
                </button>
              )
            ))}
          </div>
        )}

        {/* The same fan, carrying tools instead of colors — one block for both
            slots, since only the contents of toolItems differ. Every tool in
            the set is shown, the one in hand included and marked: a chooser
            that hides what is already held makes the user work out which of
            the rest they are holding. */}
        {toolItems.length > 0 && (
          <div className={styles.flyout}>
            {toolItems.map(item => (
              <button
                key={item.tool}
                className={clsx(styles.flyoutToolBtn, item.tool === tool && styles.flyoutToolBtnActive)}
                style={{ transform: itemTransform(item) }}
                title={t(TOOL_DISPLAY[item.tool].labelKey)}
                aria-label={t(TOOL_DISPLAY[item.tool].labelKey)}
                aria-pressed={item.tool === tool}
                onClick={() => { onSetTool(item.tool); onFlyoutChange(null) }}
              >
                <Icon name={TOOL_DISPLAY[item.tool].icon} />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

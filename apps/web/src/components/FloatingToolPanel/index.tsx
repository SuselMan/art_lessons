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
  SLOT_CHOICES, assignSlot, sameSlotContent, slotChoiceKey, slotChoiceLabelKey, slotFace,
  slotOffset, resolveSlotTool,
  type PanelLayout, type SlotChoice,
} from './slots'
import type { FloatingPanelTool, FloatingPrimaryTool, FloatingSecondaryTool } from './tools'
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

/** Which of the panel's mutually-exclusive fans is out, if any: the palette
 *  under the color dot, or the chooser held out of one particular slot. One
 *  value rather than a flag each because they all share the same annulus
 *  around the panel — two open at once would overlap item for item, and
 *  "close the others first" is a rule that only has to hold if the state lets
 *  it be broken.
 *
 *  The slot case carries an index rather than there being one variant per
 *  slot: which slot was held decides only which slot the chosen entry lands
 *  in, and the fan itself is written once. */
export type PanelFlyout = { kind: 'palette' } | { kind: 'slot'; index: number }

const FLYOUT_LAYOUT: RayLayoutConfig = {
  // Ring 1 sits just outside the *whole panel's* own edge (radius
  // PANEL_SIZE/2 = 92), not just the small center dot — orbiting the dot
  // alone put ring 1 uncomfortably close to it. Its circumference fits
  // around sixteen items before ring 2 kicks in (see computeRayCount) —
  // COLOR_FLYOUT_MAX (32) colors, or the twenty entries in the slot
  // chooser, spill into a ring or two further out.
  baseRadius: PANEL_SIZE / 2 + FLYOUT_GAP + FLYOUT_SWATCH_SIZE / 2,
  ringSpacing: FLYOUT_SWATCH_SIZE + 6,
  raySpacing: FLYOUT_SWATCH_SIZE + 6,
  swatchRadius: FLYOUT_SWATCH_SIZE / 2,
}

interface Props {
  /** The tool actually in hand, or null while it is something no slot can
   *  name (the annotation tools, which only exist in the compact shell this
   *  panel is hidden in). Drives which slots are lit, and nothing else: what
   *  each slot *displays* comes from `layout` plus the two fields below. */
  tool: FloatingPanelTool | null
  /** Last FloatingPrimaryTool actually selected (toolSlice.ts's
   *  lastDrawingTool) — what a `drawing` role slot shows and hands back. Kept
   *  in the store rather than here because the panel is not the only thing
   *  that selects these tools: the toolbar and the hotkeys do too, and a slot
   *  that only remembered the choices made through itself would go stale the
   *  moment the same choice was made a foot to the left. */
  primaryTool: FloatingPrimaryTool
  /** The same thing for a `secondary` role slot (toolSlice.ts's
   *  lastSecondaryTool): the eraser, the smudge or the eyedropper, whichever
   *  was last in hand. */
  secondaryTool: FloatingSecondaryTool
  onSetTool: (tool: FloatingPanelTool) => void
  onUndo: () => void
  onRedo: () => void
  /** What is in each of the eight slots. Owned by the caller (settingsStore,
   *  via Room) rather than kept local: it is a preference that outlives the
   *  room, and this component is the same presentational thing it has always
   *  been — it renders a layout and reports edits to it. */
  layout: PanelLayout
  onLayoutChange: (layout: PanelLayout) => void
  /** Current color of the drawing tool, shown as the center dot — tap it to
   *  fan out the room palette (see the flyout state below). */
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
  /** Hotkey hints for the Undo/Redo slots' tooltips, formatted by the caller
   *  (see lib/hotkeys.ts's formatHotkeyLabel) — this component stays decoupled
   *  from the hotkeys registry itself, same as it already is for every other
   *  piece of Room state it's handed as props. They are the only two slot
   *  contents with a shortcut worth naming: a tool's hotkey belongs on the
   *  toolbar button that is always in the same place, not on a slot that
   *  moved here because somebody put it here. */
  undoHotkeyLabel: string
  redoHotkeyLabel: string
}

/** A draggable circular cluster of the actions most reached for while drawing
 *  (#157), independent of the header/left-toolbar (both stay as they are).
 *  Position persists per room (see panelPosition.ts) so it doesn't reset to a
 *  default corner on every visit once someone's moved it somewhere that suits
 *  their hand/device.
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
 *  ── eight slots the user lays out ──
 *
 *  It began as four fixed things — a drawing tool, an eraser, undo, redo —
 *  and grew fans so that one slot could stand for a whole set. That fixed
 *  four was the ceiling on how far it could stand in for the left toolbar:
 *  the ruler, the fill and the hand were reachable from nowhere but the
 *  toolbar, so minimal UI could not offer them at all.
 *
 *  So the compass has eight positions now (slots.ts), every one of them holds
 *  anything the toolbar holds, and the layout belongs to the user. The four
 *  new ones are the diagonals, empty by default and drawn as dots. Nothing
 *  moved: the default layout reproduces the old panel exactly, so a user who
 *  never opens a chooser sees no change.
 *
 *  Two gestures, and the split is the same one this panel has always used:
 *  a tap does what the slot holds, a hold (useLongPress) edits what it holds.
 *  A tap on an *empty* slot opens its chooser too — an empty slot has nothing
 *  else it could honestly do, and a dot that responds to nothing but a
 *  half-second hold is a feature nobody finds.
 *
 *  A slot can also hold a *role* rather than a tool — "whatever I last drew
 *  with". That is what the top and bottom buttons already were before any of
 *  this, and keeping it as something you can put in a slot is what stops the
 *  hand-laid panel from losing the one thing the fixed panel was good at:
 *  paint in watercolor, switch to minimal UI, and the watercolor is there. A
 *  role slot wears the tool's own icon, badged — see slots.ts's SlotFace for
 *  why it is not drawn with a glyph of its own. */
export function FloatingToolPanel({
  tool, primaryTool, secondaryTool, onSetTool, onUndo, onRedo, layout, onLayoutChange,
  primaryColor, palette, onSelectColor, onOpenColorPicker,
  roomId, position, onPositionChange, containerRef, hidden, flyout, onFlyoutChange,
  undoHotkeyLabel, redoHotkeyLabel,
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
    () => onFlyoutChange(flyout?.kind === 'palette' ? null : { kind: 'palette' }),
    [flyout, onFlyoutChange],
  )

  // One hold handler for all eight slots rather than eight hooks: which slot
  // is under the finger is written down on pointerdown and read back when the
  // press fires. Calling useLongPress in a loop would work today (SLOT_COUNT
  // is a constant, so the hook order is stable) but only by accident of that
  // constant, which is not a thing to leave a rule of hooks resting on.
  const pressedSlotRef = useRef(0)
  const openSlotFlyout = useCallback(
    () => onFlyoutChange({ kind: 'slot', index: pressedSlotRef.current }),
    [onFlyoutChange],
  )
  const { onPointerDown: onSlotHold } = useLongPress({ onLongPress: openSlotFlyout })
  const holdSlot = useCallback((index: number, e: React.PointerEvent<HTMLElement>) => {
    pressedSlotRef.current = index
    onSlotHold(e)
  }, [onSlotHold])

  // A tap on a slot: do whatever the slot holds.
  //
  // Two things come first. While this slot's own chooser is out, the tap tucks
  // it back — the same button opened it (by being held), so the same button is
  // where a hand reaches to undo that, and doing the slot's action instead
  // would leave the fan hanging behind whatever just happened. And an empty
  // slot opens its chooser, because that is the only thing an empty slot has
  // to offer.
  //
  // A tap on a *different* slot while some fan is out is an ordinary action,
  // and closes the fan on the way — a fan left fanned out around a panel whose
  // selection just moved is pointing at a decision that has already been made.
  const tapSlot = useCallback((index: number) => {
    if (flyout?.kind === 'slot' && flyout.index === index) { onFlyoutChange(null); return }
    const content = layout[index]
    if (!content) { onFlyoutChange({ kind: 'slot', index }); return }
    if (flyout) onFlyoutChange(null)
    if (content.kind === 'action') { (content.action === 'undo' ? onUndo : onRedo)(); return }
    const resolved = resolveSlotTool(content, primaryTool, secondaryTool)
    if (resolved) onSetTool(resolved)
  }, [flyout, onFlyoutChange, layout, onUndo, onRedo, onSetTool, primaryTool, secondaryTool])

  // Picking an entry out of a slot's chooser. Assigning and selecting are one
  // gesture on purpose: someone who just put the ruler in a slot wants the
  // ruler, and making them tap the slot afterwards to actually get it turns
  // one decision into two.
  //
  // Undo and redo are the exception, and it is not an inconsistency: firing
  // them would undo real work as a side effect of arranging a panel. Nothing
  // is lost by it either — they are the two entries whose slot you can tap the
  // instant the fan closes.
  const chooseForSlot = useCallback((index: number, choice: SlotChoice) => {
    onLayoutChange(assignSlot(layout, index, choice))
    onFlyoutChange(null)
    if (choice.kind === 'clear' || choice.kind === 'action') return
    const resolved = resolveSlotTool(choice, primaryTool, secondaryTool)
    if (resolved) onSetTool(resolved)
  }, [layout, onLayoutChange, onFlyoutChange, onSetTool, primaryTool, secondaryTool])

  // Reset to collapsed on *every* change of which fan is out, not just on
  // closing: swapping one fan straight for the other (holding a slot while the
  // palette is still open — the backdrop sits below the panel, so its buttons
  // stay live) would otherwise inherit the previous fan's already-true
  // animateIn and have the new items appear at full radius with no motion at
  // all. Keyed on the fan's identity rather than the object, so a re-render
  // that hands back an equal-but-new `flyout` doesn't restart the animation.
  const flyoutKey = flyout === null ? '' : flyout.kind === 'palette' ? 'palette' : `slot:${flyout.index}`
  useEffect(() => {
    setAnimateIn(false)
    if (flyoutKey === '') return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setAnimateIn(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [flyoutKey])

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
  // currently sits in its container. Shared by both fans so the chooser comes
  // out along the exact same rays the colors do — one geometry, and in
  // particular one answer to "which directions are blocked by the nearest
  // screen edge".
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
    if (flyout?.kind !== 'palette') return []
    const colors = palette.slice(0, COLOR_FLYOUT_MAX)
    return layoutAroundPanel(colors.length + 1).map((pos, i) => ({
      ...pos,
      color: i === 0 ? null : colors[i - 1], // null marks the leading "open picker" slot
    }))
  }, [flyout, palette, layoutAroundPanel])

  // The slot chooser: the same fan carrying every entry a slot can hold. One
  // list for all eight slots, since which one was held only decides where the
  // chosen entry lands.
  const choiceItems = useMemo(() => {
    if (flyout?.kind !== 'slot') return []
    return layoutAroundPanel(SLOT_CHOICES.length).map((pos, i) => ({ ...pos, choice: SLOT_CHOICES[i] }))
  }, [flyout, layoutAroundPanel])

  // Collapsed onto the panel's own center until animateIn flips true one frame
  // later (see the effect above) — that's the "flies out from under the panel"
  // motion, done as a CSS transition rather than JS-driven.
  const itemTransform = useCallback((item: { x: number; y: number }) => {
    const offset = animateIn ? item : { x: 0, y: 0 }
    return `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`
  }, [animateIn])

  const openSlot = flyout?.kind === 'slot' ? flyout.index : null

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
          aria-label={t(flyout?.kind === 'palette' ? 'palette.closeLabel' : 'palette.openLabel')}
        />

        {/* The eight slots. Positioned from slotOffset rather than from eight
            CSS classes so the compass radius has one home (slots.ts, where
            the arithmetic that pins it down is written out) instead of being
            spread across a stylesheet that cannot see PANEL_SIZE. */}
        {layout.map((content, index) => {
          const offset = slotOffset(index)
          const face = slotFace(content, primaryTool, secondaryTool)
          const resolved = resolveSlotTool(content, primaryTool, secondaryTool)
          // Empty slots and action slots are never "current". A role slot and
          // a fixed slot holding the same tool are both lit at once, which is
          // the honest answer: both of them would hand you that tool.
          const active = resolved !== null && resolved === tool
          const label = face ? t(face.labelKey) : t('palette.slotEmpty')
          // The tooltip names the slot and then says how to change it. For
          // undo/redo it names the shortcut too, which is the form those two
          // tooltips have always had.
          const titleItem = content?.kind === 'action'
            ? content.action === 'undo'
              ? t('room.undoTitle', { hotkey: undoHotkeyLabel })
              : t('room.redoTitle', { hotkey: redoHotkeyLabel })
            : label
          return (
            <button
              key={index}
              data-slot={index}
              className={clsx(styles.btn, active && styles.btnActive, openSlot === index && styles.btnOpen)}
              style={{ transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)` }}
              onClick={() => tapSlot(index)}
              onPointerDown={e => holdSlot(index, e)}
              title={face ? t('palette.slotHold', { item: titleItem }) : t('palette.slotEmptyHold')}
              aria-label={label}
              aria-pressed={active}
            >
              {face ? (
                <>
                  <Icon name={face.icon} />
                  {/* The badge that separates "the pencil" from "whichever
                      one I last drew with, currently the pencil". Marked
                      aria-hidden: the button's own label already names the
                      role, so a reader announcing the badge would say it
                      twice. */}
                  {face.isRole && (
                    <span className={styles.roleBadge} aria-hidden="true"><Icon name="history" /></span>
                  )}
                </>
              ) : (
                <span className={styles.emptyDot} aria-hidden="true" />
              )}
            </button>
          )
        })}

        {flyout?.kind === 'palette' && (
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

        {/* The same fan, carrying what a slot can hold instead of colors. Every
            entry is shown, including the one already in the slot and the tool
            already in hand, both marked: a chooser that hides what you have
            makes you work out which of the rest you are holding. */}
        {openSlot !== null && (
          <div className={styles.flyout}>
            {choiceItems.map(({ choice, ...pos }) => {
              const face = slotFace(choice, primaryTool, secondaryTool)
              const labelKey = slotChoiceLabelKey(choice)
              const assigned = choice.kind !== 'clear'
                ? sameSlotContent(layout[openSlot], choice)
                : layout[openSlot] === null
              return (
                <button
                  key={slotChoiceKey(choice)}
                  data-choice={slotChoiceKey(choice)}
                  className={clsx(styles.flyoutToolBtn, assigned && styles.flyoutToolBtnActive)}
                  style={{ transform: itemTransform(pos) }}
                  title={labelKey ? t(labelKey) : undefined}
                  aria-label={labelKey ? t(labelKey) : undefined}
                  aria-pressed={assigned}
                  onClick={() => chooseForSlot(openSlot, choice)}
                >
                  {face ? (
                    <>
                      <Icon name={face.icon} />
                      {face.isRole && (
                        <span className={styles.roleBadge} aria-hidden="true"><Icon name="history" /></span>
                      )}
                    </>
                  ) : (
                    <Icon name="close" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

import { useLayoutEffect, useRef, useState } from 'react'

import { useDismissOnOutside } from './useDismissOnOutside'

/** Distance kept between the popup and the viewport edges when clamping. */
const VIEWPORT_MARGIN = 8

/** Gap between the trigger and the popup hanging off it. */
const ANCHOR_GAP = 4

interface PopupAnchorOptions {
  /** Which of the trigger's edges the popup lines up with. Only the preferred
   *  alignment — the clamp below overrides it when the popup wouldn't fit
   *  either way. */
  align?: 'left' | 'right'
  /** Give the popup at least the trigger's own width. What a `<select>`-style
   *  dropdown wants (the list reads as an extension of the closed field) and
   *  what an icon-button's menu does not. */
  matchTriggerWidth?: boolean
  /** Anything that changes the popup's own measured size while it stays open
   *  (e.g. the number of items) — position is measured once per open, so a
   *  content change has to ask for a re-measure explicitly. */
  remeasureKey?: unknown
}

interface PopupAnchor<T extends HTMLElement, P extends HTMLElement> {
  triggerRef: React.RefObject<T | null>
  popupRef: React.RefObject<P | null>
  /** Spread onto the portaled popup element. Before the first measurement it
   *  parks the popup at the origin and hides it, so the frame it's measured in
   *  isn't visible as a jump. */
  style: React.CSSProperties
}

/** Anchors a portaled popup (dropdown menu, select list) to its trigger in
 *  viewport coordinates, clamped to stay on screen, and closes it on an
 *  outside pointerdown, Escape, scroll or resize.
 *
 *  (#335) Extracted from `Menu`, which grew this after `LayerPanel` had
 *  already grown its own copy (#328) — the tool-type pickers would have been
 *  the third. `Menu` keeps its own action-list semantics; this hook is only
 *  the geometry and the open/close plumbing under it.
 *
 *  Everything the popup is positioned against — the trigger's box and the
 *  viewport — is read once per open rather than tracked, so an open popup is
 *  pinned where it was placed; a scroll or resize underneath it closes it
 *  instead, which is what a dropdown does everywhere else. */
export function usePopupAnchor<T extends HTMLElement, P extends HTMLElement>(
  open: boolean,
  onDismiss: () => void,
  { align = 'right', matchTriggerWidth = false, remeasureKey }: PopupAnchorOptions = {},
): PopupAnchor<T, P> {
  const triggerRef = useRef<T>(null)
  const popupRef = useRef<P>(null)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; maxHeight: number } | null>(null)
  // Read through a ref so a call site can pass an inline arrow without
  // re-registering the scroll/resize listeners on every render (same reason
  // useDismissOnOutside does it).
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useDismissOnOutside(open, [triggerRef, popupRef], onDismiss)

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const popupEl = popupRef.current
    const triggerEl = triggerRef.current
    if (!popupEl || !triggerEl) return

    const rect = triggerEl.getBoundingClientRect()
    const { width, height } = popupEl.getBoundingClientRect()
    const m = VIEWPORT_MARGIN

    // Flip above the trigger rather than merely sliding up when there's no
    // room below, so the popup never covers the row it belongs to.
    let top = rect.bottom + ANCHOR_GAP
    if (top + height > window.innerHeight - m) top = rect.top - height - ANCHOR_GAP
    top = Math.max(m, Math.min(top, window.innerHeight - height - m))

    const preferredLeft = align === 'left' ? rect.left : rect.right - width
    const left = Math.max(m, Math.min(preferredLeft, window.innerWidth - width - m))

    setPos({
      top, left,
      minWidth: matchTriggerWidth ? rect.width : 0,
      // The popup scrolls only when it genuinely doesn't fit the viewport —
      // a fixed `max-height: Nvh` in CSS would put a scrollbar on a list that
      // had room to open whole. Measured before this is applied, so a list
      // taller than the screen has already been clamped to the top edge above.
      maxHeight: window.innerHeight - 2 * m,
    })
  }, [open, align, matchTriggerWidth, remeasureKey])

  useLayoutEffect(() => {
    if (!open) return
    // Capture phase: the scroll that matters is usually an inner container's
    // (the layer list, the settings panel), and those don't bubble to window.
    // The popup's *own* scroll is the exception — it doesn't move the popup
    // relative to anything, and closing on it made a scrollable list
    // impossible to scroll at all (#335 follow-up: neither wheel nor dragging
    // its scrollbar survived a single event).
    const onScroll = (e: Event) => {
      const target = e.target
      if (target instanceof Node && popupRef.current?.contains(target)) return
      onDismissRef.current()
    }
    const close = () => onDismissRef.current()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return {
    triggerRef,
    popupRef,
    style: pos
      ? { top: pos.top, left: pos.left, minWidth: pos.minWidth || undefined, maxHeight: pos.maxHeight }
      : { top: 0, left: 0, visibility: 'hidden' },
  }
}

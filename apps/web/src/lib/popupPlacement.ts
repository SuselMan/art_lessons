// Pure geometry for `usePopupAnchor` — where a portaled popup goes given the
// trigger's box, its own measured size and the viewport. Framework- and
// DOM-free (like cameraMath.ts and FloatingToolPanel's colorFlyout.ts) so the
// flip-and-clamp rules are unit-testable without a browser.
//
// Split out in #542, when the hook grew a second placement: the colour flyout
// hangs off a well pinned in the tool rail, and a popup this tall dropped
// *below* that well covers the rest of the rail — which is to say it hides the
// tool whose colour is being chosen.

export interface PopupRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface PopupSize {
  width: number
  height: number
}

export interface PopupViewport {
  width: number
  height: number
}

export interface PlacePopupOptions {
  /** Which side of the trigger the popup prefers. `below` is what a dropdown
   *  does; `right` is for a trigger in a vertical rail against a screen edge. */
  placement?: 'below' | 'right'
  /** Which of the trigger's edges a `below` popup lines up with. */
  align?: 'left' | 'right'
  /** Distance kept between the popup and the viewport edges when clamping. */
  margin: number
  /** Gap between the trigger and the popup hanging off it. */
  gap: number
}

/** Where to put the popup, in viewport coordinates.
 *
 *  On the axis the placement hangs off, the popup flips to the trigger's other
 *  side when the preferred one has no room, rather than merely sliding — a
 *  popup that slid would end up on top of the trigger, which is the one place
 *  it must never be. On the other axis it lines up with the trigger and is then
 *  clamped into the viewport. */
export function placePopup(
  trigger: PopupRect, popup: PopupSize, viewport: PopupViewport, options: PlacePopupOptions,
): { top: number; left: number } {
  const { placement = 'below', align = 'right', margin: m, gap } = options
  let top: number
  let left: number

  if (placement === 'right') {
    left = trigger.right + gap
    if (left + popup.width > viewport.width - m) left = trigger.left - popup.width - gap
    // Top-aligned with the trigger rather than centred on it: this popup is
    // usually far taller than the button it belongs to, and centring would push
    // it off the top of a rail whose trigger sits just under the header.
    top = trigger.top
  } else {
    top = trigger.bottom + gap
    if (top + popup.height > viewport.height - m) top = trigger.top - popup.height - gap
    left = align === 'left' ? trigger.left : trigger.right - popup.width
  }

  return {
    top: Math.max(m, Math.min(top, viewport.height - popup.height - m)),
    left: Math.max(m, Math.min(left, viewport.width - popup.width - m)),
  }
}

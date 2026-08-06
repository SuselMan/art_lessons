// (#405) Who gets Escape, and who gets Enter.
//
// A transform session ends on Enter (apply) and Esc (throw away). Both keys
// were already spoken for several times over by the time they reached the
// canvas — a dialog, a dropdown, a rename field and the hotkey recorder all
// answer to Escape — so the editor cannot simply listen on `window` and act.
// It has to be last in line, and "last in line" needs to be a rule written
// down once rather than a growing pile of conditions inside one keydown
// handler.
//
// The rule is: the deepest open thing wins, and the canvas is the floor.
// Everything above it is already on screen *over* the canvas, so a keypress
// meant for it is never meant for a session underneath.
//
// Kept DOM-free so the ordering is directly testable — Room supplies the four
// facts from `isModalOpen()`, `isDismissLayerOpen()`, the event's own
// `defaultPrevented`, and its target.

/** Who a keypress belongs to, deepest first. Only `editor` means the room's
 *  own handler may act on it. */
export type KeyOwner =
  /** Something deeper already called preventDefault on this very event —
   *  a component-level handler (OptionPopup, NumberField) claiming its key.
   *  The most reliable signal there is, because it comes from the event
   *  itself rather than from a registry that could be out of date. */
  | 'handled'
  /** A modal is up (modalSlot.ts). A modal owns the keyboard outright: its
   *  own Escape closes it, and nothing behind it should react at all. */
  | 'modal'
  /** The keypress landed in a text field. Escape there reverts the edit and
   *  Enter commits it (room rename, layer rename, NumberField) — both are the
   *  field's, and a session ending underneath a rename would be baffling. */
  | 'textField'
  /** A popover/menu/picker is open (useDismissOnOutside). Its Escape closes
   *  it; only once it is gone does Escape reach the canvas. */
  | 'popover'
  /** Nothing is layered over the canvas — the editor may act. */
  | 'editor'

export interface KeyContext {
  /** `KeyboardEvent.defaultPrevented` for this event. */
  defaultPrevented: boolean
  /** `isModalOpen()` from components/Modal/modalSlot. */
  modalOpen: boolean
  /** The event target is an `<input>`/`<textarea>`/contentEditable element. */
  typing: boolean
  /** `isDismissLayerOpen()` from lib/useDismissOnOutside. */
  popoverOpen: boolean
}

/** The single statement of the precedence above. Order matters and is the
 *  whole content of this function: each clause is strictly "on top of" the
 *  ones below it on screen. */
export function keyOwner(ctx: KeyContext): KeyOwner {
  if (ctx.defaultPrevented) return 'handled'
  if (ctx.modalOpen) return 'modal'
  if (ctx.typing) return 'textField'
  if (ctx.popoverOpen) return 'popover'
  return 'editor'
}

/** Whether the room's own global handler may act on this keypress. */
export function editorOwnsKey(ctx: KeyContext): boolean {
  return keyOwner(ctx) === 'editor'
}

/** The `typing` half of a KeyContext, read off a real event target.
 *
 *  `<select>` is deliberately absent: the app has none, and a keydown on one
 *  would be the browser's own list navigation rather than text entry. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
}

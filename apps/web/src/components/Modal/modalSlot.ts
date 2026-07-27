/** (#310) Exactly one modal is open at a time — opening one closes whichever
 *  was already open. There is no stack, deliberately: no flow in the app puts
 *  a dialog on top of a dialog, and nesting would mean per-level z-index,
 *  focus-restore ordering and Escape routing that nothing would exercise.
 *
 *  Module-level rather than part of the Zustand store (CLAUDE.md: "one global
 *  store for all app state") because nothing *renders* from this — it is
 *  DOM-level bookkeeping between mounted components, the same kind of thing
 *  `lib/backNavigationGuard` holds. */

export interface ModalSlotEntry {
  /** Asks the owning component to unmount this modal — i.e. its own `onClose`. */
  close: () => void
}

let active: ModalSlotEntry | null = null

/** Registers `entry` as the open modal, closing the previous one if there is
 *  one. Called from Modal's mount effect. */
export function claimModalSlot(entry: ModalSlotEntry): void {
  const previous = active
  // Reassigned *before* closing: `previous.close()` normally makes its owner
  // unmount it right away, and that unmount calls releaseModalSlot(previous),
  // which must see it is no longer the holder and leave this new claim alone.
  active = entry
  if (previous && previous !== entry) previous.close()
}

export function releaseModalSlot(entry: ModalSlotEntry): void {
  if (active === entry) active = null
}

/** True while a modal is mounted. Global keydown handlers (Room's hotkeys)
 *  check this to stay out of the way: they listen on `window` in the bubble
 *  phase, and a modal's own key events reach `window` too — a portal changes
 *  where the node sits in the DOM, not that events bubble up to it. */
export function isModalOpen(): boolean {
  return active !== null
}

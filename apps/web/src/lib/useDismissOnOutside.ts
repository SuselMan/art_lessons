import { useEffect, useRef, type RefObject } from 'react'

// (#405) How many popovers built on this hook are open right now. A counter
// rather than a boolean because several can legitimately be mounted at once
// (a menu whose item opens a picker), and StrictMode mounts every effect
// twice — the same reasoning as lib/reloadSafety's own holds counter.
//
// It exists for one reader: the editor's global Escape handler, which cancels
// an open transform session and must not do so while anything is layered over
// the canvas. A popover's own Escape closes it and does not stop propagation
// (the listener is on `document`, and the popover may not even hold focus), so
// without this both would fire from one keypress — closing the menu *and*
// throwing away the transform underneath it. Registered here rather than at
// each call site because "a dismissable layer is open" is exactly what this
// hook means; see modalSlot.ts for the same pattern one level up.
let openDismissLayers = 0

/** True while at least one `useDismissOnOutside` popover is open. */
export function isDismissLayerOpen(): boolean {
  return openDismissLayers > 0
}

/** Closes an open popover on a pointerdown outside `ref` or on Escape.
 *
 *  Extracted once a third copy of this effect showed up (`CardMenu`,
 *  `CreateRoom`'s paper-color picker, and now the account menu in
 *  `AppHeader`), exactly as the note in CreateRoom asked for.
 *
 *  `pointerdown` rather than `click`: on a tablet the pointer sequence is what
 *  the user experiences as "tapping away", and waiting for a full click lets a
 *  drag that started outside the popover land inside it.
 *
 *  Takes either one ref or several: a popover rendered through a portal (see
 *  `Menu`) is not a DOM descendant of its own trigger, so "inside" is the union
 *  of both elements rather than one subtree.
 *
 *  `onDismiss` is read through a ref, so a call site can pass an inline arrow
 *  without re-registering the listeners on every render. */
export function useDismissOnOutside(
  open: boolean,
  ref: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  onDismiss: () => void,
): void {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  // Arrays are almost always built inline at the call site, so a new identity
  // arrives on every render; keying the effect off the array itself would
  // re-register the listeners each time. The refs inside it are stable, so
  // reading them through a ref of our own is enough.
  const refsRef = useRef(ref)
  refsRef.current = ref

  useEffect(() => {
    if (!open) return
    openDismissLayers++
    function onPointerDown(e: PointerEvent) {
      const refs = Array.isArray(refsRef.current) ? refsRef.current : [refsRef.current]
      const attached = refs.filter(r => r.current)
      // Nothing mounted to compare against — same as before, that's not an
      // "outside" click, it's a popover that isn't on screen yet.
      if (!attached.length) return
      if (!attached.some(r => r.current!.contains(e.target as Node))) onDismissRef.current()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismissRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      openDismissLayers--
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
}

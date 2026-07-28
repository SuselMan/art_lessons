import { useEffect, useRef, type RefObject } from 'react'

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
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
}

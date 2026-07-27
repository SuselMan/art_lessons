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
 *  `onDismiss` is read through a ref, so a call site can pass an inline arrow
 *  without re-registering the listeners on every render. */
export function useDismissOnOutside(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismissRef.current()
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
  }, [open, ref])
}

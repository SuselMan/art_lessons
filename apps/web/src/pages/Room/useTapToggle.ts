import { useEffect } from 'react'
import type { RefObject } from 'react'

import { TapTracker } from './tapTracker'

/** Detects a short, stationary single-finger touch tap on `ref`'s element —
 *  not a drag, not part of a multi-touch pinch/pan gesture — and calls
 *  `onTap`. Touch-only by design (#99, mirrors #96's `pointerType ===
 *  'touch'` check): pen/mouse never trigger it, so drawing with a stylus can
 *  never accidentally hide the interface. Recognition logic itself lives in
 *  TapTracker (framework/DOM-free, unit-tested there) — this hook is just
 *  the real-PointerEvent wiring around it.
 *
 *  Layered independently on top of useViewport's own touch pan/pinch
 *  handling on the same element (`vpRef`) — this hook only *observes*
 *  down/move/up positions (no preventDefault, no setPointerCapture), so it
 *  can't interfere with panning: a real drag simply never satisfies the
 *  movement threshold, and a second finger joining mid-gesture disqualifies
 *  it as a pinch/pan rather than a tap. */
export function useTapToggle(
  ref: RefObject<HTMLElement | null>,
  onTap: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    const tracker = new TapTracker()

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') tracker.down(e.pointerId, e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') tracker.move(e.pointerId, e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && tracker.up(e.pointerId)) onTap()
    }
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') tracker.cancel(e.pointerId)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [ref, onTap, enabled])
}

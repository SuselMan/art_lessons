import { useEffect } from 'react'
import type { RefObject } from 'react'

import { TapTracker } from './tapTracker'

// Diagnostic for "tap doesn't hide UI" reports that vary by device (see
// chat: works on Samsung, not on a Surface) — reports why the most recent
// touch-up did or didn't register as a tap, so it can be read off a device
// with no attached devtools. maxDistPx vs TAP_MOVE_THRESHOLD_PX tells apart
// "the digitizer reports enough jitter on a stationary touch to look like a
// drag" from "something else disqualified it" (multi-touch, or the up simply
// never reached TapTracker as pointerType 'touch' at all).
export interface TapDebugInfo {
  pointerType: string
  maxDistPx: number
  concurrentTouches: number
  wasTap: boolean
}

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
  onDebug?: (info: TapDebugInfo) => void,
): void {
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    const tracker = new TapTracker()
    // Diagnostic-only bookkeeping, parallel to TapTracker's own internal
    // state rather than reaching into it — keeps TapTracker itself
    // framework-free and its tested down/move/up/cancel contract untouched.
    const starts = new Map<number, { x: number; y: number }>()
    const maxDist = new Map<number, number>()
    let concurrent = 0

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        tracker.down(e.pointerId, e.clientX, e.clientY)
        starts.set(e.pointerId, { x: e.clientX, y: e.clientY })
        maxDist.set(e.pointerId, 0)
        concurrent++
      }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        tracker.move(e.pointerId, e.clientX, e.clientY)
        const start = starts.get(e.pointerId)
        if (start) {
          const d = Math.hypot(e.clientX - start.x, e.clientY - start.y)
          maxDist.set(e.pointerId, Math.max(maxDist.get(e.pointerId) ?? 0, d))
        }
      }
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const wasTap = tracker.up(e.pointerId)
        onDebug?.({
          pointerType: e.pointerType,
          maxDistPx: maxDist.get(e.pointerId) ?? 0,
          concurrentTouches: concurrent,
          wasTap,
        })
        starts.delete(e.pointerId)
        maxDist.delete(e.pointerId)
        concurrent = Math.max(0, concurrent - 1)
        if (wasTap) onTap()
      }
    }
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        tracker.cancel(e.pointerId)
        starts.delete(e.pointerId)
        maxDist.delete(e.pointerId)
        concurrent = Math.max(0, concurrent - 1)
      }
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
  }, [ref, onTap, enabled, onDebug])
}

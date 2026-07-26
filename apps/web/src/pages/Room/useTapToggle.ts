import { useEffect } from 'react'

import { diagLog } from '../../lib/diagLog'
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
 *  Takes the element itself (useViewport's `vpEl` — state, not a ref) rather
 *  than a RefObject, so this effect runs exactly when `.viewport` mounts and
 *  unmounts; see the comment inside on what reading a ref here cost.
 *
 *  Layered independently on top of useViewport's own touch pan/pinch
 *  handling on the same element (`vpEl`) — this hook only *observes*
 *  down/move/up positions (no preventDefault, no setPointerCapture), so it
 *  can't interfere with panning: a real drag simply never satisfies the
 *  movement threshold, and a second finger joining mid-gesture disqualifies
 *  it as a pinch/pan rather than a tap. */
export function useTapToggle(
  el: HTMLElement | null,
  onTap: () => void,
  enabled: boolean,
  onDebug?: (info: TapDebugInfo) => void,
): void {
  useEffect(() => {
    if (!enabled) { diagLog('useTapToggle: disabled, not attaching'); return }

    // This effect re-runs freely (its deps include `onTap`/`onDebug`, which
    // aren't guaranteed referentially stable across every Room re-render),
    // and used to read a RefObject whose `.current` it could legitimately
    // observe as null — seen live on Android: `roomContentReady` flipping
    // false mid-session re-ran this effect while `vpRef.current` was
    // momentarily unset, and since the old code just gave up (`if (!el)
    // return`, no cleanup registered, nothing to ever retry it),
    // tap-to-hide broke *for the rest of the session* even though
    // `.viewport` itself never actually unmounted and useViewport's own
    // gesture listeners (a different effect, different deps) kept working
    // the whole time. Taking the element as a *value* (useViewport's `vpEl`
    // state) fixes that at the source: when it's null the element genuinely
    // isn't mounted (Room renders the join gate before `config` arrives),
    // and the effect re-runs by itself the moment it is.
    if (!el) return

    diagLog('useTapToggle: attached listeners on', el.className || el.tagName)

    const tracker = new TapTracker()
    // Diagnostic-only bookkeeping, parallel to TapTracker's own internal
    // state rather than reaching into it — keeps TapTracker itself
    // framework-free and its tested down/move/up/cancel contract untouched.
    const starts = new Map<number, { x: number; y: number }>()
    const maxDist = new Map<number, number>()
    let concurrent = 0

    const onDown = (e: PointerEvent) => {
      diagLog('tap: down', { id: e.pointerId, type: e.pointerType, activeBefore: [...starts.keys()] })
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
        diagLog('tap: up', { id: e.pointerId, wasTap, maxDistPx: maxDist.get(e.pointerId) ?? 0, concurrent, staleIdsBefore: [...starts.keys()] })
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
      } else {
        diagLog('tap: up ignored, pointerType is', e.pointerType)
      }
    }
    const onCancel = (e: PointerEvent) => {
      diagLog('tap: cancel', { id: e.pointerId, type: e.pointerType })
      if (e.pointerType === 'touch') {
        tracker.cancel(e.pointerId)
        starts.delete(e.pointerId)
        maxDist.delete(e.pointerId)
        concurrent = Math.max(0, concurrent - 1)
      }
    }

    // A pointerup/pointercancel can be lost entirely (app backgrounded
    // mid-touch, an OS-level gesture stealing the sequence, a permission
    // prompt, etc.) — when that happens, TapTracker's `active` Map keeps a
    // stale entry forever, and since `up()`'s tap check requires
    // `active.size === 1`, that alone silently disqualifies every future
    // single-finger tap from ever registering again. visibilitychange/blur
    // are the most reliable generic "can't trust this pointer's own
    // up/cancel anymore" signals available — full reset on either.
    const resetAll = () => {
      diagLog('tap: resetAll fired', { reason: document.hidden ? 'visibilitychange(hidden)' : 'blur/visibilitychange(visible)', hadStale: [...starts.keys()] })
      tracker.reset()
      starts.clear()
      maxDist.clear()
      concurrent = 0
    }
    document.addEventListener('visibilitychange', resetAll)
    window.addEventListener('blur', resetAll)

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)

    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('visibilitychange', resetAll)
      window.removeEventListener('blur', resetAll)
    }
  }, [el, onTap, enabled, onDebug])
}

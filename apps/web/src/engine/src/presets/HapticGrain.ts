// Experimental "for fun" prototype (not a tracked feature) — simulates paper
// grain as a vibration texture. A deterministic hash grid over paper-space
// coordinates marks a sparse set of "bump" cells; whenever a stroke's path
// crosses into one, we fire a very short navigator.vibrate() pulse. Because
// the grid is hashed from paper coordinates (the same x/y PointerInput
// already normalizes pan/zoom/rotation out of — see PointerInput.ts's
// setTransform), the same physical spot on the paper buzzes the same way
// every time you cross it, which is what makes it read as a fixed texture
// rather than noise.
//
// Known limits (see chat): Android Chrome only — iOS Safari has no Vibration
// API at all. No amplitude/frequency control, just on/off pulses. And a
// passive stylus doesn't transmit vibration to the fingertip, so this will
// likely only read as anything when drawing with a finger.

function hash2(ix: number, iy: number): number {
  let h = ix * 374761393 + iy * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 100000) / 100000
}

// Debug counters (see chat: "vibrates from the test button but not while
// drawing") — cellsEntered/bumpsHit/vibrateOk let a tablet with no attached
// devtools tell apart "never reaching the grid", "grid never crosses the
// density threshold", and "vibrate() is called but the browser silently
// rejects it during a stylus drag" — vibrate() never throws, it just returns
// false, so this is the only way to see that from on-screen.
export interface HapticGrainStats {
  cellsEntered: number
  bumpsHit: number
  vibrateOk: number
}

export class HapticGrain {
  private cellSize: number
  private density: number
  private pulseMs: number
  private minIntervalMs: number
  private _lastCellX = NaN
  private _lastCellY = NaN
  private _lastVibrateAt = -Infinity
  private _stats: HapticGrainStats = { cellsEntered: 0, bumpsHit: 0, vibrateOk: 0 }
  private _onStats?: (stats: HapticGrainStats) => void

  // pulseMs used to be 4 — real vibration motors have ~30-60ms of physical
  // ramp-up latency, and navigator.vibrate() *cancels and restarts* on every
  // call (see MDN), so back-to-back bump cells (which happen well inside 4ms
  // of each other at drawing speed) kept preempting the motor before it ever
  // spun up: vibrateOk kept incrementing (the browser genuinely accepted
  // every call) while nothing physical ever happened. minIntervalMs enforces
  // a floor between real navigator.vibrate() calls so an accepted pulse gets
  // a chance to actually run before the next one can cancel it; bumpsHit
  // still counts every grid hit, so vibrateOk staying below it now reflects
  // intentional throttling rather than browser rejection.
  constructor(cellSize = 10, density = 0.35, pulseMs = 16, onStats?: (stats: HapticGrainStats) => void, minIntervalMs = 40) {
    this.cellSize = cellSize
    this.density = density
    this.pulseMs = pulseMs
    this.minIntervalMs = minIntervalMs
    this._onStats = onStats
  }

  // Call on stroke start so the first move sample after it doesn't compare
  // against a stale cell from a previous, unrelated stroke.
  reset(): void {
    this._lastCellX = NaN
    this._lastCellY = NaN
  }

  // Call on every real pointer move with paper-space (x0,y0) = previous
  // point, (x1,y1) = current point. Steps through the segment in half-cell
  // increments so fast strokes don't skip whole cells, and fires at most one
  // pulse per newly-entered bump cell (not per step), so lingering in a cell
  // doesn't machine-gun the motor.
  sample(x0: number, y0: number, x1: number, y1: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0)
    const step = this.cellSize / 2
    const steps = Math.max(1, Math.ceil(dist / step))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t
      const cx = Math.floor(x / this.cellSize)
      const cy = Math.floor(y / this.cellSize)
      if (cx === this._lastCellX && cy === this._lastCellY) continue
      this._lastCellX = cx
      this._lastCellY = cy
      this._stats.cellsEntered++
      if (hash2(cx, cy) < this.density) {
        this._stats.bumpsHit++
        const now = performance.now()
        if (now - this._lastVibrateAt >= this.minIntervalMs) {
          const ok = navigator.vibrate?.(this.pulseMs) ?? false
          if (ok) { this._stats.vibrateOk++; this._lastVibrateAt = now }
        }
      }
      // Spread into a fresh object — React's setState bails out on an
      // identical object reference, and _stats is mutated in place above.
      this._onStats?.({ ...this._stats })
    }
  }
}

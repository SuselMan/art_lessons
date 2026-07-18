// Normalizes pointer events (mouse and stylus) to canvas physical coordinates.
// Uses getCoalescedEvents() for smoother high-frequency stylus input.
//
// When a viewport transform is set via setTransform(), coordinates are computed
// analytically (accounting for pan/zoom/rotation) rather than via getBoundingClientRect(),
// which breaks for rotated elements (it returns the axis-aligned bounding box).
//
// Optional pointer prediction (#92): getPredictedEvents() forecasts forward
// (unlike getCoalescedEvents(), which only catches up on real past samples).
// Only wired up when a 'predict' handler is registered (see onPredict()) —
// PointerInput never even calls getPredictedEvents() otherwise, so this is
// zero-cost when the caller doesn't opt in. Predicted samples are extracted
// via _extractPredicted(), a non-mutating twin of _extract(): it must never
// touch _lastT/_lastX/_lastY, since those drive the *real* speed calculation
// for the next genuine sample and a wrong prediction must never corrupt it.

export interface PointerData {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  speed: number
  pointerType: string
  // Real DOMHighResTimeStamp the browser/OS recorded for this sample
  // (PointerEvent.timeStamp), NOT performance.now() at handler-entry — by
  // the time our handler runs there's already browser/OS event-dispatch
  // buffering between the two (#104). This is the correct clock to measure
  // genuine end-to-end input-to-paint latency against.
  timeStamp: number
}

type PointerEventName = 'start' | 'move' | 'end'
type PointerHandler = (data: PointerData) => void
type PredictHandler = (data: PointerData[]) => void

export class PointerInput {
  private canvas: HTMLCanvasElement
  private _handlers: Partial<Record<PointerEventName, PointerHandler>>
  private _predictHandler?: PredictHandler
  private _active: boolean
  private _lastT: number
  private _lastX: number
  private _lastY: number
  private _transform: ((clientX: number, clientY: number) => { x: number; y: number }) | null

  // (#187 diagnostic instrumentation, temporary — remove once root-caused)
  // Which pointer actually started/owns the in-progress stroke. Move events
  // never checked this against the incoming event's own pointerId before —
  // the working theory is that a second input source (mouse hover, a
  // secondary touch) sending its own pointermove while a stylus stroke is
  // active gets silently misattributed to that stroke, producing the
  // reported mid-stroke "jump"/break. This doesn't change behavior (no
  // early return added), just makes a mismatch visible in the console —
  // filter devtools for "[PointerInput]".
  private _activePointerId: number | null
  private _activePointerType: string | null

  private _down: (e: PointerEvent) => void
  private _move: (e: PointerEvent) => void
  private _up: (e: PointerEvent) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this._handlers = {}
    this._active = false
    this._lastT = 0
    this._lastX = 0
    this._lastY = 0
    this._transform = null
    this._activePointerId = null
    this._activePointerType = null

    this._down   = this._handleDown.bind(this)
    this._move   = this._handleMove.bind(this)
    this._up     = this._handleUp.bind(this)

    canvas.addEventListener('pointerdown',   this._down)
    canvas.addEventListener('pointermove',   this._move)
    canvas.addEventListener('pointerup',     this._up)
    canvas.addEventListener('pointercancel', this._up)
    canvas.style.touchAction = 'none'
  }

  on(event: PointerEventName, fn: PointerHandler): this {
    this._handlers[event] = fn
    return this
  }

  // Registers the optional predicted-samples handler (#92). Called at most
  // once per native pointermove, with every sample from that event's
  // getPredictedEvents() (oldest → newest), after all real 'move' handlers
  // for the same event have already fired. Not calling this at all keeps
  // prediction fully off — see _handleMove.
  onPredict(fn: PredictHandler): this {
    this._predictHandler = fn
    return this
  }

  // Supply a function that converts (clientX, clientY) → canvas physical {x, y}.
  // Called once after each setViewport() so the closure captures current transform.
  setTransform(fn: (clientX: number, clientY: number) => { x: number; y: number }): void {
    this._transform = fn
  }

  private _emit(event: PointerEventName, data: PointerData): void {
    this._handlers[event]?.(data)
  }

  private _toCanvasCoords(e: PointerEvent): { x: number; y: number } {
    if (this._transform) return this._transform(e.clientX, e.clientY)
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (this.canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (this.canvas.height / rect.height),
    }
  }

  private _toPointerData(e: PointerEvent, x: number, y: number, speed: number): PointerData {
    let pressure = e.pressure ?? 0.5
    if (e.pointerType === 'mouse' && pressure === 0) pressure = 0.5
    return { x, y, pressure, tiltX: e.tiltX ?? 0, tiltY: e.tiltY ?? 0, speed, pointerType: e.pointerType, timeStamp: e.timeStamp }
  }

  private _extract(e: PointerEvent): PointerData {
    const now = performance.now()
    const dt  = now - this._lastT || 1

    const { x, y } = this._toCanvasCoords(e)
    const speed = Math.hypot(x - this._lastX, y - this._lastY) / dt
    this._lastT = now
    this._lastX = x
    this._lastY = y

    return this._toPointerData(e, x, y, speed)
  }

  // Non-mutating twin of _extract(), used only for predicted samples (see
  // the class-level comment above): computes coordinates/speed the same way,
  // but must never write _lastT/_lastX/_lastY — a wrong prediction must never
  // corrupt the real speed calculation for the next genuine sample.
  private _extractPredicted(e: PointerEvent): PointerData {
    const now = performance.now()
    const dt  = now - this._lastT || 1

    const { x, y } = this._toCanvasCoords(e)
    const speed = Math.hypot(x - this._lastX, y - this._lastY) / dt

    return this._toPointerData(e, x, y, speed)
  }

  private _handleDown(e: PointerEvent): void {
    if (e.button !== 0) return
    if (e.pointerType === 'touch') return // touch → pan/zoom/rotate at viewport level
    // (#187 diagnostic instrumentation, temporary — remove once root-caused;
    // filter devtools console for "[PointerInput]") — a pointerdown while a
    // stroke is already active would mean two input sources are down at
    // once, which _handleMove's mismatch check below can't itself explain
    // (it only fires on *moves* from an unexpected pointer).
    if (this._active) {
      console.warn('[PointerInput] pointerdown while a stroke is already active', {
        newPointerId: e.pointerId, newPointerType: e.pointerType,
        activePointerId: this._activePointerId, activePointerType: this._activePointerType,
      })
    }
    console.log('[PointerInput] down', { pointerId: e.pointerId, pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY })
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    this._active = true
    this._activePointerId = e.pointerId
    this._activePointerType = e.pointerType
    this._lastT = performance.now()
    this._emit('start', this._extract(e))
  }

  private _handleMove(e: PointerEvent): void {
    if (!this._active) return
    // (#187 diagnostic instrumentation, temporary) — the working theory: a
    // second input source (mouse hover, a secondary touch) sends its own
    // pointermove while a stylus stroke is active, and — since nothing
    // before this ever checked pointerId — gets silently misattributed to
    // that stroke, producing the reported mid-stroke jump/break. Logging
    // only, no early return: behavior must stay exactly as before until
    // this is actually confirmed, so a reproduction here is trustworthy.
    if (e.pointerId !== this._activePointerId) {
      console.warn('[PointerInput] MOVE FROM MISMATCHED POINTER — likely the "mouse conflict" (#187)', {
        movePointerId: e.pointerId, movePointerType: e.pointerType,
        activePointerId: this._activePointerId, activePointerType: this._activePointerType,
      })
    }
    const beforeX = this._lastX, beforeY = this._lastY, beforeT = this._lastT
    const events = e.getCoalescedEvents?.() ?? [e]
    for (const ev of events) this._emit('move', this._extract(ev))
    // A big time gap since the last real sample, or an implausibly large
    // jump in canvas-pixel coordinates, could independently produce a
    // visible break — logging both to see whether either actually happens,
    // and whether it correlates with "especially at high zoom" (jump
    // distance is canvas-pixel space, which a caller's setTransform scales
    // very differently at high zoom than at 100%).
    const dt = this._lastT - beforeT
    if (dt > 80) {
      console.warn('[PointerInput] large gap since last move sample', {
        dtMs: Math.round(dt), pointerId: e.pointerId, pointerType: e.pointerType,
      })
    }
    const jumpPx = Math.hypot(this._lastX - beforeX, this._lastY - beforeY)
    if (jumpPx > 400) {
      console.warn('[PointerInput] large coordinate jump since last move sample', {
        jumpPx: Math.round(jumpPx), dtMs: Math.round(dt), pointerId: e.pointerId, pointerType: e.pointerType,
        from: { x: beforeX, y: beforeY }, to: { x: this._lastX, y: this._lastY },
      })
    }

    // Prediction is opt-in and additive: only touched at all when a caller
    // registered onPredict() (see PencilEngineOptions.predictPointer), so
    // there is no cost here otherwise.
    if (this._predictHandler) {
      const predicted = e.getPredictedEvents?.() ?? []
      if (predicted.length) this._predictHandler(predicted.map(p => this._extractPredicted(p)))
    }
  }

  private _handleUp(e: PointerEvent): void {
    if (!this._active) return
    // (#187 diagnostic instrumentation, temporary) — distinguishes a normal
    // pointerup from a pointercancel (both routed here) — e.g. a tablet OS
    // canceling the stylus's pointer mid-stroke (palm rejection, focus
    // switch) would end the stroke abruptly too, a distinct cause from the
    // mismatched-pointer theory above.
    console.log('[PointerInput] ' + (e.type === 'pointercancel' ? 'CANCEL' : 'up'), {
      pointerId: e.pointerId, pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY,
    })
    this._active = false
    this._activePointerId = null
    this._activePointerType = null
    this._emit('end', this._extract(e))
  }

  destroy(): void {
    const c = this.canvas
    c.removeEventListener('pointerdown',   this._down)
    c.removeEventListener('pointermove',   this._move)
    c.removeEventListener('pointerup',     this._up)
    c.removeEventListener('pointercancel', this._up)
  }
}

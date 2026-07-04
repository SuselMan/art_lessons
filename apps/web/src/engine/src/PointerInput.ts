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
    return { x, y, pressure, tiltX: e.tiltX ?? 0, tiltY: e.tiltY ?? 0, speed, pointerType: e.pointerType }
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
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    this._active = true
    this._lastT = performance.now()
    this._emit('start', this._extract(e))
  }

  private _handleMove(e: PointerEvent): void {
    if (!this._active) return
    const events = e.getCoalescedEvents?.() ?? [e]
    for (const ev of events) this._emit('move', this._extract(ev))

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
    this._active = false
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

import { diagLog } from '../../lib/diagLog'
import {
  compilePressureCalibration, isIdentityCalibration, type PressureCalibration,
} from '../../lib/pressureCalibration'

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

  // (#187) Which pointer actually started/owns the in-progress stroke.
  // Kept, not temporary — see the note above _handleDown.
  // Move events
  // never checked this against the incoming event's own pointerId before —
  // the working theory is that a second input source (mouse hover, a
  // secondary touch) sending its own pointermove while a stylus stroke is
  // active gets silently misattributed to that stroke, producing the
  // reported mid-stroke "jump"/break. This doesn't change behavior (no
  // early return added), just makes a mismatch visible in the console —
  // filter devtools for "[PointerInput]".
  private _activePointerId: number | null
  private _activePointerType: string | null

  // (#517) Per-stroke shape of what the browser actually delivered, reported
  // once on the up/cancel that ends the stroke: how many pointermove events
  // arrived and over how long. A hatching stroke that "was ignored" is either
  // absent from the log entirely (no down at all) or present with a move count
  // of 0-1 and a duration far shorter than the hand made — the two answers
  // point at completely different layers, and nothing before this could tell
  // them apart after the fact.
  private _moveCount: number
  private _downAt: number
  // Rate limit for the "moves while no stroke is active" probe below: one line
  // per run of such moves, not one per event, so a genuinely lost pointerdown
  // is loud without a hover-capable device filling the ring buffer.
  private _orphanMoveLogged: boolean

  // (#475) The person's own pressure calibration, compiled once per change
  // rather than per sample — see compilePressureCalibration. Null until one is
  // set, and null again for an identity calibration, so an uncalibrated device
  // runs the exact pre-#475 code path rather than a closure that happens to be
  // the identity.
  private _pressureMap: ((raw: number) => number) | null

  private _down: (e: PointerEvent) => void
  // (#517) See _handleCanvasTouchStart — a listener whose entire body is one
  // preventDefault, and the reason strokes stop disappearing on iPad.
  private _canvasTouchStart: (e: TouchEvent) => void
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
    this._pressureMap = null
    this._moveCount = 0
    this._downAt = 0
    this._orphanMoveLogged = false

    this._down   = this._handleDown.bind(this)
    this._canvasTouchStart = this._handleCanvasTouchStart.bind(this)
    this._move   = this._handleMove.bind(this)
    this._up     = this._handleUp.bind(this)

    canvas.addEventListener('pointerdown',   this._down)
    // (#517) Capture phase on window, so it runs before the event reaches any
    // target at all and sees presses this canvas never gets. See
    // _handleWindowDown for what question that answers.
    //
    // Guarded, unlike the canvas listeners above: the engine's own tests build
    // a PencilEngine around a mock canvas under node, where `canvas` supplies
    // addEventListener but there is no DOM global at all. Everything this
    // probe answers is about a real browser, so having it simply not exist
    // off one is correct rather than a compromise.
    canvas.addEventListener('pointermove',   this._move)
    canvas.addEventListener('pointerup',     this._up)
    canvas.addEventListener('pointercancel', this._up)
    canvas.style.touchAction = 'none'
    // (#517) See _handleCanvasTouchStart. `passive: false` is the whole point:
    // a passive listener may not preventDefault, and preventDefault is the
    // entire content of this subscription.
    canvas.addEventListener('touchstart', this._canvasTouchStart, { passive: false })
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

  // (#475) Installs the person's pressure calibration. Takes effect on the
  // next sample, including mid-stroke — which is what makes the settings
  // panel's curve editor draggable while drawing, and is harmless because
  // dab geometry is baked per dab, so earlier dabs of the same stroke keep
  // what they were recorded with.
  //
  // This is the *only* place a calibration is applied. It has to be, because
  // the corrected value goes on to be recorded in the Operation Log and
  // replayed on every other participant's screen — see the module comment in
  // pressureCalibration.ts.
  setPressureCalibration(cal: PressureCalibration | null): void {
    this._pressureMap = cal === null || isIdentityCalibration(cal)
      ? null
      : compilePressureCalibration(cal)
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
    // (#475) Pen only. A mouse has no pressure to correct (it sits at the
    // substituted 0.5 above), and touch never reaches here at all — it is
    // routed to pan/zoom/rotate before a stroke starts. Calibrating either
    // would apply a correction measured for a stylus to an input that never
    // produced the problem.
    else if (e.pointerType === 'pen' && this._pressureMap) pressure = this._pressureMap(pressure)
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

  /** (#517) The fix for strokes that vanished on iPad, and a listener that
   *  looks exactly like dead code — one `preventDefault()` and nothing else.
   *  It is not. Deleting it brings the bug back.
   *
   *  What was happening: while hatching (many short quick strokes), roughly
   *  one stroke in fifteen produced no mark at all. Instrumenting the whole
   *  path showed the loss was not ours anywhere along it — the contact reached
   *  the page on *neither* channel, no `pointerdown` and no `touchstart`, and
   *  a 100 ms stall watch stayed silent throughout, so the main thread was
   *  free at the time. iPadOS was deciding the contact did not belong to the
   *  web content, and deciding it before dispatching anything at all. The
   *  operation log agreed: the strokes that did arrive were recorded
   *  perfectly, and the ones that vanished were never there to record.
   *
   *  Why this listener is what fixes it, and why `touch-action` is not:
   *  `touch-action: none` is already set here *and* on `body`, and the strokes
   *  still vanished. It is the declarative half — it tells WebKit which
   *  default actions this element forgoes. A non-passive `touchstart` that
   *  really calls preventDefault() is the imperative half: it tells the UI
   *  process, on each contact, that the web content is consuming touches, and
   *  that is an input to how the *next* contact gets routed. Hence
   *  `{ passive: false }` — a passive listener may not preventDefault, which
   *  would leave this genuinely empty.
   *
   *  Measured, not assumed: 100 consecutive hatching strokes with no loss,
   *  against a rate that had been costing about one in fifteen.
   *
   *  It takes nothing away. Pan, pinch and rotate are driven from pointer
   *  events in useViewport, never from touch events or from native scrolling,
   *  so the default action being removed is one nothing in this app uses.
   *
   *  Pinned by PointerInput.touchDefault.test.ts, which exists because this is
   *  precisely the shape of code a later cleanup deletes as a no-op. */
  private _handleCanvasTouchStart(e: TouchEvent): void {
    e.preventDefault()
  }

  /** (#187) These four probes stay. They were written as temporary
   *  instrumentation for a mid-stroke break that only ever showed up on
   *  Ilya's tablet, and the issue closed 04.08 without a root cause: a
   *  four-minute session on the Tab S7+ aimed squarely at the reported
   *  gestures produced no break and fired none of them — including through
   *  stretches where pen and palm-touch pointers were interleaved, which is
   *  the exact condition the mismatched-pointer theory was about.
   *
   *  "No cause found" is the reason to keep them, not to remove them. A
   *  symptom seen on one person's hardware and not since will come back, if
   *  it comes back, in the middle of a lesson — and each probe names a
   *  different cause (second input source, dropped samples, coordinate
   *  transform, OS-level cancel), so whichever one fires is the diagnosis.
   *  Re-adding them afterwards means waiting for a second reproduction.
   *
   *  They cost a diagLog per pointerdown/up — once per stroke, never per
   *  move; the move-path probes only speak when something is actually
   *  wrong. */
  private _handleDown(e: PointerEvent): void {
    // (#517) Both of these used to return in silence, which is exactly the
    // shape of the iPad report they exist for: a stroke that leaves *nothing*
    // cannot be an engine bug — DabSystem.startStroke unconditionally returns
    // the touch-down dab, so any stroke that reached _onStart leaves at least
    // one mark. A completely absent stroke therefore died here or never
    // arrived, and only a log can say which.
    if (e.button !== 0 || e.pointerType === 'touch') {
      diagLog('[PointerInput] down IGNORED', {
        reason: e.button !== 0 ? 'button' : 'pointerType',
        pointerId: e.pointerId, pointerType: e.pointerType,
        button: e.button, buttons: e.buttons, pressure: e.pressure, isPrimary: e.isPrimary,
      })
      return
    }
    // (#187) A pointerdown while a
    // stroke is already active would mean two input sources are down at
    // once, which _handleMove's mismatch check below can't itself explain
    // (it only fires on *moves* from an unexpected pointer).
    if (this._active) {
      diagLog('[PointerInput] pointerdown while a stroke is already active', {
        newPointerId: e.pointerId, newPointerType: e.pointerType,
        activePointerId: this._activePointerId, activePointerType: this._activePointerType,
      })
    }
    diagLog('[PointerInput] down', {
      pointerId: e.pointerId, pointerType: e.pointerType,
      clientX: Math.round(e.clientX), clientY: Math.round(e.clientY),
      pressure: e.pressure, buttons: e.buttons, isPrimary: e.isPrimary,
    })
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    this._active = true
    this._moveCount = 0
    this._downAt = performance.now()
    this._orphanMoveLogged = false
    this._activePointerId = e.pointerId
    this._activePointerType = e.pointerType
    this._lastT = performance.now()
    this._emit('start', this._extract(e))
  }

  private _handleMove(e: PointerEvent): void {
    if (!this._active) {
      // (#517) A pen dragging across the canvas with its tip pressed
      // (buttons !== 0) while no stroke is open means the pointerdown that
      // should have opened one never reached this handler — the browser
      // either never dispatched it or sent it somewhere else. That is the one
      // failure the rest of the pipeline cannot see at all, and it is the
      // leading explanation for "каждый 15-й штрих игнорится".
      //
      // Hover moves (buttons === 0, an M2-class iPad or a mouse) are not it
      // and stay silent; one line per run, not per event.
      if (e.buttons !== 0 && e.pointerType !== 'touch' && !this._orphanMoveLogged) {
        this._orphanMoveLogged = true
        diagLog('[PointerInput] MOVE WITH NO ACTIVE STROKE — the pointerdown never arrived', {
          pointerId: e.pointerId, pointerType: e.pointerType,
          buttons: e.buttons, pressure: e.pressure,
        })
      }
      return
    }
    this._moveCount++
    // (#187) The working theory was: a
    // second input source (mouse hover, a secondary touch) sends its own
    // pointermove while a stylus stroke is active, and — since nothing
    // before this ever checked pointerId — gets silently misattributed to
    // that stroke, producing the reported mid-stroke jump/break. Logging
    // only, no early return: behavior must stay exactly as before until
    // this is actually confirmed, so a reproduction here is trustworthy.
    if (e.pointerId !== this._activePointerId) {
      diagLog('[PointerInput] MOVE FROM MISMATCHED POINTER — likely the "mouse conflict" (#187)', {
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
      diagLog('[PointerInput] large gap since last move sample', {
        dtMs: Math.round(dt), pointerId: e.pointerId, pointerType: e.pointerType,
      })
    }
    const jumpPx = Math.hypot(this._lastX - beforeX, this._lastY - beforeY)
    if (jumpPx > 400) {
      diagLog('[PointerInput] large coordinate jump since last move sample', {
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
    if (!this._active) {
      // (#517) Same reasoning as the orphan-move probe: an up for a pen whose
      // down was never seen is the signature of a lost pointerdown.
      if (e.pointerType !== 'touch') {
        diagLog('[PointerInput] up/cancel WITH NO ACTIVE STROKE', {
          type: e.type, pointerId: e.pointerId, pointerType: e.pointerType,
        })
      }
      return
    }
    // (#517) The other way a stroke can vanish: something that is not the pen
    // ends it. _handleDown ignores touch outright, but this handler never
    // checked either the pointer type or the id — so a palm contact's own
    // pointerup/pointercancel (iPadOS delivers a palm and then cancels it)
    // closes the pen's stroke instead. Killed one sample in, that leaves a
    // single touch-down dab and reads as a stroke that never happened; killed
    // later it truncates, which is #187's mid-stroke break.
    //
    // Logged rather than filtered, deliberately, for the reason #187's own
    // probes give: turning this into an early return before it has been seen
    // once on the device would remove the evidence along with the symptom, and
    // the fix would be unfalsifiable. It is one line away once a capture shows
    // it firing.
    if (e.pointerId !== this._activePointerId) {
      diagLog('[PointerInput] END FROM MISMATCHED POINTER — a foreign pointer is closing the stroke', {
        type: e.type, endPointerId: e.pointerId, endPointerType: e.pointerType,
        activePointerId: this._activePointerId, activePointerType: this._activePointerType,
        movesSoFar: this._moveCount, ageMs: Math.round(performance.now() - this._downAt),
      })
    }
    // (#187) Distinguishes a normal
    // pointerup from a pointercancel (both routed here) — e.g. a tablet OS
    // canceling the stylus's pointer mid-stroke (palm rejection, focus
    // switch) would end the stroke abruptly too, a distinct cause from the
    // mismatched-pointer theory above.
    diagLog('[PointerInput] ' + (e.type === 'pointercancel' ? 'CANCEL' : 'up'), {
      pointerId: e.pointerId, pointerType: e.pointerType,
      clientX: Math.round(e.clientX), clientY: Math.round(e.clientY),
      // (#517) The shape of the stroke that just ended. `moves: 0` next to a
      // few milliseconds is a stroke the hand made and the browser did not
      // report — whatever ink landed is the single touch-down dab.
      moves: this._moveCount, durationMs: Math.round(performance.now() - this._downAt),
    })
    this._active = false
    this._activePointerId = null
    this._activePointerType = null
    this._emit('end', this._extract(e))
  }

  destroy(): void {
    const c = this.canvas
    c.removeEventListener('pointerdown',   this._down)
    c.removeEventListener('touchstart', this._canvasTouchStart)
    c.removeEventListener('pointermove',   this._move)
    c.removeEventListener('pointerup',     this._up)
    c.removeEventListener('pointercancel', this._up)
  }
}

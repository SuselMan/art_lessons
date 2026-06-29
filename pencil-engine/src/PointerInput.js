// Normalizes pointer events (mouse and stylus) to a consistent format.
// Uses getCoalescedEvents() for smoother high-frequency stylus input.

export class PointerInput {
  constructor(canvas) {
    this.canvas = canvas;
    this._handlers = {};
    this._active = false;
    this._lastT = 0;
    this._lastX = 0;
    this._lastY = 0;

    this._down   = this._down.bind(this);
    this._move   = this._move.bind(this);
    this._up     = this._up.bind(this);

    canvas.addEventListener('pointerdown',   this._down);
    canvas.addEventListener('pointermove',   this._move);
    canvas.addEventListener('pointerup',     this._up);
    canvas.addEventListener('pointercancel', this._up);
    canvas.style.touchAction = 'none';
  }

  on(event, fn) { this._handlers[event] = fn; return this; }

  _emit(event, data) {
    this._handlers[event]?.(data);
  }

  _extract(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width  / rect.width;
    const sy = this.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top)  * sy;

    const now = performance.now();
    const dt  = now - this._lastT || 1;
    const spd = Math.hypot(x - this._lastX, y - this._lastY) / dt; // px/ms

    this._lastT = now;
    this._lastX = x;
    this._lastY = y;

    // Mouse always reports pressure 0 or 0.5; treat 0 as 0.5 for usability
    let pressure = e.pressure ?? 0.5;
    if (e.pointerType === 'mouse' && pressure === 0) pressure = 0.5;

    return {
      x, y,
      pressure,
      tiltX: e.tiltX ?? 0,
      tiltY: e.tiltY ?? 0,
      speed: spd,
      pointerType: e.pointerType,
    };
  }

  _down(e) {
    if (e.button !== 0) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    this._active = true;
    this._lastT = performance.now();
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this._emit('start', this._extract(e));
  }

  _move(e) {
    if (!this._active) return;
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) {
      this._emit('move', this._extract(ev));
    }
  }

  _up(e) {
    if (!this._active) return;
    this._active = false;
    this._emit('end', this._extract(e));
  }

  destroy() {
    const c = this.canvas;
    c.removeEventListener('pointerdown',   this._down);
    c.removeEventListener('pointermove',   this._move);
    c.removeEventListener('pointerup',     this._up);
    c.removeEventListener('pointercancel', this._up);
  }
}

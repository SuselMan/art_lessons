import { createClickBuffer } from './PencilSound'

// #280: discrete "precision instrument" click for the radial angle dial
// (#277) — one per whole degree crossed while dragging. Reuses PencilSound's
// own createClickBuffer (the exact primitive it already bakes for
// GrainVariant.tap's touchdown transient), not the rest of that file's
// continuous, speed-driven paper-friction graph — a fundamentally different
// sound (one short percussive event vs. an always-looping noise source), so
// this gets its own tiny AudioContext rather than reaching into a live
// PencilSound instance's graph. Gated by the separate "Звук интерфейса"
// feature flag (featureFlags.ts), independent of "Pencil sound".
//
// freqHz/decaySeconds/noiseMix are a first-pass, uncalibrated pick (same
// "verify by ear and retune" status every other first-pass constant in this
// codebase carries) — high and short enough to read as a mechanical detent
// tick, not a tone.
const CLICK_FREQ_HZ = 2200
const CLICK_DECAY_SECONDS = 0.012
const CLICK_NOISE_MIX = 0.4
const CLICK_GAIN = 0.5

export class InterfaceClick {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null

  // Lazy, like PencilSound's own ensureGraph — must be reached from a real
  // user gesture (a pointerdown on the dial qualifies) the first time.
  private ensure(): { ctx: AudioContext; buffer: AudioBuffer } {
    if (!this.ctx) this.ctx = new AudioContext()
    if (!this.buffer) this.buffer = createClickBuffer(this.ctx, CLICK_FREQ_HZ, CLICK_DECAY_SECONDS, CLICK_NOISE_MIX)
    return { ctx: this.ctx, buffer: this.buffer }
  }

  play(): void {
    const { ctx, buffer } = this.ensure()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = CLICK_GAIN
    source.connect(gain).connect(ctx.destination)
    source.start()
  }

  destroy(): void {
    void this.ctx?.close()
    this.ctx = null
    this.buffer = null
  }
}

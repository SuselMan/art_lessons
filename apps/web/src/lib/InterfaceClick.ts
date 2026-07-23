import { createClickBuffer } from './PencilSound'

// #280 follow-up: Ilya, after trying the first pass — spinning the radial
// dial fast made it "гудит как счётчик Гейгера" (buzzes like a Geiger
// counter) rather than reading as discrete clicks. Two separate causes,
// both fixed here:
//   1. The dial used to fire one play() per whole-degree boundary crossed
//      in a *single* pointermove — a fast drag can cross a dozen+ degrees
//      in one event, so a burst of identical clicks all started at the same
//      audio-clock instant, which is exactly what a buzz/comb-filtered drone
//      is made of. Now the dial calls play() once per pointermove regardless
//      of how many boundaries were crossed; see RadialDial's own comment.
//   2. Even one call per event isn't enough on a device with a very high
//      pointermove rate — MIN_INTERVAL_MS below hard-caps how often a click
//      can actually fire, silently dropping anything faster. ~20-25 clicks/
//      sec is roughly where a train of short percussive clicks stops
//      sounding like a buzz to the ear (below that, they read as discrete
//      ticks; a real precision instrument's detents don't click faster than
//      you can actually feel them either) — first-pass, tune-by-ear number,
//      same status every other constant here carries.
//
// Timbre: Ilya asked for something closer to PencilSound's own pencil-tap/
// "knock on the table" sound (GrainVariant.tap, freqHz 120/decaySeconds
// 0.02/noiseMix 0.35 — see PENCIL_SOUND_VARIANT_3 in PencilSound.ts), just
// pitched up, rather than the original pass's much shorter/sharper
// freqHz 2200 pick. createClickBuffer's own two-resonator structure (a low
// "body" mode plus a higher, faster-decaying "knock" mode at freqHz*3.2 —
// see its own doc comment) already gives a knock its percussive character;
// raising freqHz and keeping tap's own decay/noiseMix in the same
// ballpark reads as a lighter/higher knock instead of a low thud, without
// turning into the previous pass's thin "tick".
const CLICK_FREQ_HZ = 520
const CLICK_DECAY_SECONDS = 0.02
const CLICK_NOISE_MIX = 0.3
const CLICK_GAIN = 0.5
const MIN_INTERVAL_MS = 45

export class InterfaceClick {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private lastPlayTime = 0

  // Lazy, like PencilSound's own ensureGraph — must be reached from a real
  // user gesture (a pointerdown on the dial qualifies) the first time.
  private ensure(): { ctx: AudioContext; buffer: AudioBuffer } {
    if (!this.ctx) this.ctx = new AudioContext()
    if (!this.buffer) this.buffer = createClickBuffer(this.ctx, CLICK_FREQ_HZ, CLICK_DECAY_SECONDS, CLICK_NOISE_MIX)
    return { ctx: this.ctx, buffer: this.buffer }
  }

  /** No-ops (silently) if called again within MIN_INTERVAL_MS of the last
   *  actual play — the caller doesn't need to know or care; it can call
   *  this as often as it likes (e.g. once per pointermove) and the rate
   *  limiting happens here, in one place, for every future caller too. */
  play(): void {
    const now = performance.now()
    if (now - this.lastPlayTime < MIN_INTERVAL_MS) return
    this.lastPlayTime = now

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

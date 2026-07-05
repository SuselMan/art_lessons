// Procedural pencil-on-paper friction sound (experimental, feature-flagged as
// 'pencilSound' — see featureFlags.ts). Driven entirely by the pointer stream
// the engine already emits (PointerData via its 'strokeStart'/'pointer'/
// 'strokeEnd' events — see engine/index.ts), so no engine or PointerInput
// changes were needed to wire this up.
//
// Redesigned after first feedback ("sounds like a spray can, doesn't stop
// when the pointer stops, speed barely matters"). Two structural problems
// caused that:
//   1. Loudness was driven by pressure alone, so a stylus resting on the
//      canvas with no motion still made noise — physically wrong: friction
//      noise requires relative motion, full stop, so speed must gate/dominate
//      loudness, not just color it. See speedNorm()/masterGainTarget() below,
//      plus the idle watchdog (real 'pointer' events only arrive on motion —
//      a stylus held perfectly still mid-stroke sends none at all, so without
//      a watchdog the last nonzero gain would hang there indefinitely).
//   2. A single continuously-filtered noise source is smooth broadband hiss —
//      that's what reads as "spray can". Real paper-tooth friction is grainy:
//      many discrete micro-impacts, not one continuous tone. The `modulator`
//      branch below synthesizes that by lowpassing a second, independent
//      noise source at a speed-dependent rate and rectifying it into an
//      envelope that amplitude-modulates the carrier — sparse/clicky at low
//      speed, dense enough to blend into bright noise at high speed (matches
//      the physical description: slow strokes carry audible low-frequency
//      "clicks", fast strokes read as high-frequency hiss).
//
// Also modeled, per a more detailed acoustics rundown: pencil hardness
// (harder = drier/brighter scratch, softer = duller/deeper/velvety — a
// high-shelf + low-shelf pair driven by PENCIL_PRESETS[grade].hardness) and
// stylus tilt (more tilt = more side-of-tip contact area = duller tone — a
// lowpass driven by PointerData.tiltX/tiltY, which the engine already
// reports). Rotation-around-the-tip-axis (real pencils' point wears
// unevenly) is *not* modeled — PointerEvent exposes no such data, and
// fabricating it would just be a random LFO with no real acoustic basis.

import type { PaperType } from '@art-lessons/shared'

const MIN_FREQ = 500
const MAX_FREQ = 6000
const MAX_SPEED = 6 // px/ms — strokes faster than this just clamp to MAX_FREQ/full gain
const SPEED_DEADZONE = 0.12 // px/ms — below this: no perceptible motion, so no sound at all

const GRAIN_MIN_HZ = 8    // near the deadzone: slow, distinct "clicks"
const GRAIN_MAX_HZ = 220  // at full speed: dense enough to blend into continuous texture
const GRAIN_FLOOR = 0.12  // carrierGain's constant base — a little body under the grain envelope
const GRAIN_DEPTH = 1.4   // modulator → carrierGain.gain scale (see ensureGraph)

const GAIN_CEILING = 0.5   // hard cap regardless of how loud pressure/paper push it
const IDLE_MS = 60         // no fresh pointer sample within this window → treat as stopped
const IDLE_CHECK_MS = 30

const RAMP_FAST = 0.02 // gain — must react almost instantly to stopping/starting
const RAMP_SLOW = 0.05 // filter sweeps — smoother so they don't zipper

const HARDNESS_SHELF_FREQ = 2200
const HARDNESS_SHELF_MIN_DB = -6 // softest pencil: darker
const HARDNESS_SHELF_MAX_DB = 8  // hardest pencil: brighter/drier
const LOW_SHELF_FREQ = 300
const LOW_SHELF_MIN_DB = 0 // hardest pencil: no extra low-mid warmth
const LOW_SHELF_MAX_DB = 5 // softest pencil: a bit of "deeper/velvety" body

const TILT_MAX_DEG = 70          // typical PointerEvent tiltX/Y span; clamp beyond this
const TILT_LOWPASS_MAX_HZ = 9000 // near-upright: no extra darkening
const TILT_LOWPASS_MIN_HZ = 1800 // heavily tilted: duller, broader-contact tone

// Self-contained on purpose: doesn't reach into engine's PAPER_ROUGHNESS
// (a shader-tuning constant retuned for visual reasons, unrelated to and
// less stable than what an acoustic "how gritty/loud is this paper" factor
// needs).
const PAPER_SOUND_FACTOR: Record<PaperType, number> = {
  rough: 1.0,
  smooth: 0.75,
  bristol: 0.55,
}

function speedNorm(speed: number): number {
  const s = Math.max(0, speed - SPEED_DEADZONE)
  return Math.min(1, s / (MAX_SPEED - SPEED_DEADZONE))
}

function hardnessT(hardness: number): number {
  // PENCIL_PRESETS clamps hardness to [0.05, 0.95] — normalize that to 0..1.
  return Math.min(1, Math.max(0, (hardness - 0.05) / 0.9))
}

function brightnessFreq(speed: number, hardness: number): number {
  const t = speedNorm(speed)
  const hardnessBias = (hardnessT(hardness) - 0.5) * 1200
  return Math.min(MAX_FREQ, Math.max(MIN_FREQ, MIN_FREQ + t * (MAX_FREQ - MIN_FREQ) + hardnessBias))
}

function grainRateHz(speed: number): number {
  return GRAIN_MIN_HZ + speedNorm(speed) * (GRAIN_MAX_HZ - GRAIN_MIN_HZ)
}

function bandpassQ(pressure: number): number {
  return 0.7 + Math.max(0, pressure) * 1.2 // harder press → narrower/more resonant → "denser scratch"
}

function masterGainTarget(pressure: number, speed: number, paperFactor: number): number {
  const t = speedNorm(speed)
  if (t <= 0) return 0
  const speedGain = Math.sqrt(t) // fast rise off the deadzone — speed dominates loudness
  const pressureFactor = 0.5 + Math.max(0, pressure) * 0.9
  return Math.min(GAIN_CEILING, speedGain * pressureFactor * paperFactor * 0.4)
}

function tiltNorm(tiltX: number, tiltY: number): number {
  return Math.min(1, Math.hypot(tiltX, tiltY) / TILT_MAX_DEG)
}

function tiltLowpassFreq(tiltX: number, tiltY: number): number {
  return TILT_LOWPASS_MAX_HZ - tiltNorm(tiltX, tiltY) * (TILT_LOWPASS_MAX_HZ - TILT_LOWPASS_MIN_HZ)
}

function hardnessShelfDb(hardness: number): number {
  const t = hardnessT(hardness)
  return HARDNESS_SHELF_MIN_DB + t * (HARDNESS_SHELF_MAX_DB - HARDNESS_SHELF_MIN_DB)
}

function lowShelfDb(hardness: number): number {
  const t = 1 - hardnessT(hardness)
  return LOW_SHELF_MIN_DB + t * (LOW_SHELF_MAX_DB - LOW_SHELF_MIN_DB)
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 2
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function createAbsCurve(): Float32Array<ArrayBuffer> {
  const n = 1024
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) curve[i] = Math.abs(-1 + (2 * i) / (n - 1))
  return curve
}

const ABS_CURVE = createAbsCurve()

interface AudioGraph {
  ctx: AudioContext
  bandpass: BiquadFilterNode
  grainLowpass: BiquadFilterNode
  tiltLowpass: BiquadFilterNode
  lowShelf: BiquadFilterNode
  hardnessShelf: BiquadFilterNode
  masterGain: GainNode
}

export class PencilSound {
  private graph: AudioGraph | null = null
  private paperFactor: number
  private hardness = 0.38 // HB — overwritten by setHardness before the first real stroke
  private idleTimer: number | null = null
  private lastSampleAt = 0

  constructor(paper: PaperType) {
    this.paperFactor = PAPER_SOUND_FACTOR[paper]
  }

  /** Call whenever the active pencil grade changes (PENCIL_PRESETS[grade].hardness). */
  setHardness(hardness: number): void {
    this.hardness = hardness
    if (!this.graph) return
    const now = this.graph.ctx.currentTime
    this.graph.hardnessShelf.gain.setTargetAtTime(hardnessShelfDb(hardness), now, RAMP_SLOW)
    this.graph.lowShelf.gain.setTargetAtTime(lowShelfDb(hardness), now, RAMP_SLOW)
  }

  /** Call on strokeStart. */
  start(pressure: number, speed: number, tiltX = 0, tiltY = 0): void {
    const graph = this.ensureGraph()
    void graph.ctx.resume()
    this.lastSampleAt = performance.now()
    this.applyTarget(graph, pressure, speed, tiltX, tiltY)
    if (this.idleTimer === null) {
      this.idleTimer = window.setInterval(() => this.checkIdle(), IDLE_CHECK_MS)
    }
  }

  /** Call on every 'pointer' event while a stroke is active. */
  update(pressure: number, speed: number, tiltX = 0, tiltY = 0): void {
    if (!this.graph) return
    this.lastSampleAt = performance.now()
    this.applyTarget(this.graph, pressure, speed, tiltX, tiltY)
  }

  /** Call on strokeEnd — fades out rather than stopping the source, so the
   *  next stroke's start() has no re-construction/gesture-unlock cost. */
  stop(): void {
    if (this.idleTimer !== null) { clearInterval(this.idleTimer); this.idleTimer = null }
    if (!this.graph) return
    this.graph.masterGain.gain.setTargetAtTime(0, this.graph.ctx.currentTime, RAMP_FAST)
  }

  /** Tears the graph down entirely — call on unmount, not on strokeEnd. */
  destroy(): void {
    if (this.idleTimer !== null) { clearInterval(this.idleTimer); this.idleTimer = null }
    this.graph?.ctx.close()
    this.graph = null
  }

  // A stylus held still mid-stroke sends no further 'pointer' events at all
  // (see PointerInput — 'move' only fires on real pointermove), so without
  // this watchdog the last nonzero gain target would hang there indefinitely
  // instead of fading out — exactly the "sound never stops" symptom.
  private checkIdle(): void {
    if (!this.graph) return
    if (performance.now() - this.lastSampleAt > IDLE_MS) {
      this.graph.masterGain.gain.setTargetAtTime(0, this.graph.ctx.currentTime, RAMP_FAST)
    }
  }

  private applyTarget(graph: AudioGraph, pressure: number, speed: number, tiltX: number, tiltY: number): void {
    const now = graph.ctx.currentTime
    graph.bandpass.frequency.setTargetAtTime(brightnessFreq(speed, this.hardness), now, RAMP_SLOW)
    graph.bandpass.Q.setTargetAtTime(bandpassQ(pressure), now, RAMP_SLOW)
    graph.grainLowpass.frequency.setTargetAtTime(grainRateHz(speed), now, RAMP_SLOW)
    graph.tiltLowpass.frequency.setTargetAtTime(tiltLowpassFreq(tiltX, tiltY), now, RAMP_SLOW)
    graph.masterGain.gain.setTargetAtTime(masterGainTarget(pressure, speed, this.paperFactor), now, RAMP_FAST)
  }

  /** Builds the audio graph on first use and leaves both noise sources
   *  looping for the module's lifetime (muted via `masterGain` between
   *  strokes) — cheaper and simpler than tearing down/recreating
   *  AudioBufferSourceNodes per stroke, since a source can only ever be
   *  started once. Must be reached from a real user gesture the first time
   *  (pointerdown qualifies) — that's why this is lazy rather than built in
   *  the constructor. */
  private ensureGraph(): AudioGraph {
    if (this.graph) return this.graph
    const ctx = new AudioContext()

    // ── Carrier: broadband paper-friction texture ──────────────────────────
    const carrier = ctx.createBufferSource()
    carrier.buffer = createNoiseBuffer(ctx)
    carrier.loop = true

    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.Q.value = 0.7

    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 180 // cuts rumble below any real paper-friction content

    const carrierGain = ctx.createGain()
    carrierGain.gain.value = GRAIN_FLOOR // base floor; the grain modulator adds the rest (see below)

    const tiltLowpass = ctx.createBiquadFilter()
    tiltLowpass.type = 'lowpass'
    tiltLowpass.frequency.value = TILT_LOWPASS_MAX_HZ

    const lowShelf = ctx.createBiquadFilter()
    lowShelf.type = 'lowshelf'
    lowShelf.frequency.value = LOW_SHELF_FREQ
    lowShelf.gain.value = lowShelfDb(this.hardness)

    const hardnessShelf = ctx.createBiquadFilter()
    hardnessShelf.type = 'highshelf'
    hardnessShelf.frequency.value = HARDNESS_SHELF_FREQ
    hardnessShelf.gain.value = hardnessShelfDb(this.hardness)

    const masterGain = ctx.createGain()
    masterGain.gain.value = 0

    carrier
      .connect(bandpass).connect(highpass).connect(carrierGain)
      .connect(tiltLowpass).connect(lowShelf).connect(hardnessShelf)
      .connect(masterGain).connect(ctx.destination)
    carrier.start()

    // ── Grain modulator: turns the carrier from smooth hiss into discrete
    //    micro-texture — see the class-level comment for why this exists. ──
    const modulator = ctx.createBufferSource()
    modulator.buffer = createNoiseBuffer(ctx) // independent buffer — must not correlate with the carrier
    modulator.loop = true

    const grainLowpass = ctx.createBiquadFilter()
    grainLowpass.type = 'lowpass'
    grainLowpass.frequency.value = GRAIN_MIN_HZ

    const rectify = ctx.createWaveShaper()
    rectify.curve = ABS_CURVE // folds the lowpassed noise to non-negative — a usable AM envelope

    const grainDepth = ctx.createGain()
    grainDepth.gain.value = GRAIN_DEPTH

    modulator.connect(grainLowpass).connect(rectify).connect(grainDepth).connect(carrierGain.gain)
    modulator.start()

    this.graph = { ctx, bandpass, grainLowpass, tiltLowpass, lowShelf, hardnessShelf, masterGain }
    return this.graph
  }
}

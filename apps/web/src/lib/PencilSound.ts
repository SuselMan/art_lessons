// Procedural pencil-on-paper friction sound. Driven entirely by the pointer
// stream the engine already emits (PointerData via its 'strokeStart'/
// 'pointer'/'strokeEnd' events — see engine/index.ts), so no engine or
// PointerInput changes were needed to wire this up. Toggled via the "Pencil
// sound" setting (see SettingsPanel/featureFlags.ts's getPencilSoundSetting)
// — 'off' skips construction entirely, 'variant1'/'variant2' pick one of the
// two GrainVariants exported below.
//
// Two structural problems shaped the design (see PENCIL_SOUND_TUNING_LOG.md
// for the full tuning history that led here):
//   1. Loudness is driven by speed, not pressure alone — a stylus resting on
//      the canvas with no motion makes no noise, since friction noise
//      requires relative motion. See speedNorm()/masterGainTarget() below,
//      plus the idle watchdog (real 'pointer' events only arrive on motion —
//      a stylus held perfectly still mid-stroke sends none at all, so
//      without a watchdog the last nonzero gain would hang there
//      indefinitely).
//   2. A single continuously-filtered noise source is smooth broadband hiss,
//      which reads as a spray can, not paper. Each grain layer (see
//      GrainLayer/buildLayer below) synthesizes texture by lowpassing a
//      second, independent noise source at a speed-dependent rate and
//      rectifying it into an envelope that amplitude-modulates the carrier.
//
// Also modeled: pencil hardness (harder = drier/brighter scratch, softer =
// duller/deeper/velvety — a high-shelf + low-shelf pair driven by
// PENCIL_PRESETS[grade].hardness) and stylus tilt (more tilt = more side-of-
// tip contact area = duller tone — a lowpass driven by PointerData.tiltX/
// tiltY, which the engine already reports).

import type { PaperType } from '@art-lessons/shared'

// Narrowed from an original 500-6000 and given its own slower ramp
// (BRIGHTNESS_RAMP, see applyTarget) after an early version's brightness
// sweeping with speed read as "howling wind"/a siren rather than paper. A
// narrower range plus a much slower glide both reduce how far and how fast
// the bandpass center chases every small speed fluctuation (curves,
// direction changes) mid-stroke — that combination (narrow resonant filter +
// wide, fast sweep) is exactly what a wind-siren/wah effect is built from.
const MIN_FREQ = 1200
const MAX_FREQ = 5000
const MAX_SPEED = 6 // px/ms — strokes faster than this just clamp to MAX_FREQ/full gain
const SPEED_DEADZONE = 0.12 // px/ms — below this: no perceptible motion, so no sound at all

export interface GrainVariant {
  floor: number  // carrierGain's constant base — lower = more silence between grains, less
                 // continuous hiss bed underneath them
  depth: number  // modulator → carrierGain.gain scale — how hard each grain hits above the floor
  curvePower: number // shapes each grain's envelope (see createGrainCurve): 1 = smooth triangle
                      // wave (reads as continuous hiss); higher = most of the cycle pushed toward
                      // silence with sharp brief spikes (reads as discrete clicks)
  minHz: number  // grain rate near the speed deadzone — slow, distinct "clicks"
  maxHz: number  // grain rate at full speed — how dense/fast grains get before blending into hiss
  useNormGain: boolean // whether the lowpassed grain noise gets rescaled back to a consistent
                        // amplitude before shaping (see normGain's docstring) — false only for the
                        // untouched original sound (BASE below), which never had this compensation;
                        // true for everything derived from it, since normGain() is what makes
                        // curvePower have any real effect at all.
  secondary?: { variant: GrainVariant; gain: number } // a second, fully independent noise+grain
                        // layer mixed underneath the primary one, at `gain` relative loudness. This
                        // is genuinely two separate noise sources summed (not just a second envelope
                        // on the same carrier) — that's what makes it read as "two textures layered"
                        // rather than "one texture with a more complex envelope". A nested variant's
                        // own `secondary` (if any) is ignored — no recursive combos.
}

// The original, untuned sound this app shipped with — floor-dominated, barely-modulated broadband
// hiss. Turned out to be a better base to build on than any of the more aggressively-grained
// alternatives tried along the way (see the tuning log) — both variants below start here.
const BASE: GrainVariant = { floor: 0.12, depth: 1.4, curvePower: 1.0, minHz: 8, maxHz: 220, useNormGain: false }

// A louder, more distinctly-grained recipe used only as variant 2's secondary layer (see below) —
// not selectable on its own.
const SECONDARY_LAYER_RECIPE: GrainVariant = { floor: 0.05, depth: 2.1, curvePower: 1.8, minHz: 5, maxHz: 140, useNormGain: true }

// BASE plus a small amount of rare, quiet grain: useNormGain flips on (needed for curvePower to
// have any real effect — see its docstring) but depth stays small and curvePower high, so the added
// grain only pokes above BASE's floor rarely and briefly instead of constantly modulating it.
export const PENCIL_SOUND_VARIANT_1: GrainVariant = { ...BASE, depth: 0.02, curvePower: 4.0, useNormGain: true }

// BASE layered with a second, independent, more distinctly-grained noise source running quietly
// underneath it (SECONDARY_LAYER_RECIPE at 1/6 volume) — see buildLayer()'s docstring for why two
// separate noise sources, not just a more complex envelope on one, is what makes this read as two
// textures at once.
export const PENCIL_SOUND_VARIANT_2: GrainVariant = { ...BASE, secondary: { variant: SECONDARY_LAYER_RECIPE, gain: 1 / 6 } }

// A 2nd-order non-resonant BiquadFilterNode lowpass only lets a narrow band of a broadband noise
// source through, so its output amplitude is small AND scales with the cutoff frequency — measured
// empirically against real BiquadFilterNode output: std ≈ NORM_K * sqrt(freq). The `rectify`
// WaveShaper below assumes a healthy ±1 input domain (that's the range its curve is built over), so
// without compensating for this, the actual signal reaching it sits around 0.005-0.06 — deep in the
// curve's near-flat center — meaning curvePower barely changes anything audible regardless of its
// value. normGain() rescales the lowpassed noise back to a consistent range before rectification, so
// curvePower actually means what it says.
const NORM_K = 0.005
const NORM_TARGET_STD = 0.35

function normGain(freqHz: number, enabled: boolean): number {
  return enabled ? NORM_TARGET_STD / (NORM_K * Math.sqrt(Math.max(freqHz, 3))) : 1
}

const GAIN_CEILING = 0.5   // hard cap regardless of how loud pressure/paper push it
const IDLE_MS = 60         // no fresh pointer sample within this window → treat as stopped
const IDLE_CHECK_MS = 30

const RAMP_FAST = 0.02 // gain — must react almost instantly to stopping/starting
const RAMP_SLOW = 0.05 // filter sweeps — smoother so they don't zipper
// Brightness gets its own, much slower ramp than other filter sweeps (RAMP_SLOW) — a fast glide
// across a wide pitch range is exactly what read as "howling wind"/siren rather than paper (see
// MIN_FREQ/MAX_FREQ's docstring above).
const BRIGHTNESS_RAMP = 0.18

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

function grainRateHz(speed: number, minHz: number, maxHz: number): number {
  return minHz + speedNorm(speed) * (maxHz - minHz)
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

function createGrainCurve(power: number): Float32Array<ArrayBuffer> {
  const n = 1024
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  // Fold to non-negative (same as a plain abs curve), then raise to `power`:
  // since the folded value is in [0, 1], a power > 1 pulls most of it toward
  // 0 and leaves only brief spikes near the extremes — power 1 alone gives a
  // smooth triangle-wave envelope, which reads as continuous hiss rather than
  // discrete grain.
  for (let i = 0; i < n; i++) {
    const folded = Math.abs(-1 + (2 * i) / (n - 1))
    curve[i] = Math.pow(folded, power)
  }
  return curve
}

// One full, independent noise+grain recipe: its own carrier noise, its own brightness bandpass, its
// own grain modulator. A GrainVariant's primary sound is always one GrainLayer; `secondary` (see
// GrainVariant's docstring) adds a second one, mixed in via `mixGain`. `recipe` is the GrainVariant
// this layer is playing — kept so applyTarget() can recompute this layer's own grain rate (which
// depends on recipe.minHz/maxHz/useNormGain) independently of whatever the other layer is doing.
interface GrainLayer {
  recipe: GrainVariant
  bandpass: BiquadFilterNode
  carrierGain: GainNode
  grainLowpass: BiquadFilterNode
  grainNormGain: GainNode
  rectify: WaveShaperNode
  grainDepthGain: GainNode
  mixGain: GainNode
}

interface AudioGraph {
  ctx: AudioContext
  layers: GrainLayer[] // 1 for a solo variant, 2 (primary + secondary) for a combo
  tiltLowpass: BiquadFilterNode
  lowShelf: BiquadFilterNode
  hardnessShelf: BiquadFilterNode
  masterGain: GainNode
}

export class PencilSound {
  private graph: AudioGraph | null = null
  private paperFactor: number
  private hardness = 0.38 // HB — overwritten by setHardness before the first real stroke
  private grain: GrainVariant
  private idleTimer: number | null = null
  private lastSampleAt = 0

  constructor(paper: PaperType, grain: GrainVariant) {
    this.paperFactor = PAPER_SOUND_FACTOR[paper]
    this.grain = grain
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
    const brightness = brightnessFreq(speed, this.hardness)
    const q = bandpassQ(pressure)
    for (const layer of graph.layers) {
      layer.bandpass.frequency.setTargetAtTime(brightness, now, BRIGHTNESS_RAMP)
      layer.bandpass.Q.setTargetAtTime(q, now, RAMP_SLOW)
      const grainRate = grainRateHz(speed, layer.recipe.minHz, layer.recipe.maxHz)
      layer.grainLowpass.frequency.setTargetAtTime(grainRate, now, RAMP_SLOW)
      // Compensates the lowpass's frequency-dependent attenuation (see normGain's docstring) so the
      // WaveShaper downstream always sees a consistently-scaled signal as the rate sweeps with speed.
      layer.grainNormGain.gain.setTargetAtTime(normGain(grainRate, layer.recipe.useNormGain), now, RAMP_SLOW)
    }
    graph.tiltLowpass.frequency.setTargetAtTime(tiltLowpassFreq(tiltX, tiltY), now, RAMP_SLOW)
    graph.masterGain.gain.setTargetAtTime(masterGainTarget(pressure, speed, this.paperFactor), now, RAMP_FAST)
  }

  /** Builds one independent noise+grain layer and connects its output into `sumNode` at
   *  `mixGainValue`. Two of these (mixed together before the shared brightness-adjacent tilt/shelf/
   *  master stages) is what lets a GrainVariant's `secondary` genuinely layer two different textures
   *  rather than just complicating one envelope: mathematically, one noise shaped by two summed
   *  envelopes is indistinguishable from that same noise shaped by one combined envelope — no
   *  genuine "two things happening" quality, just a more complex single texture. Two *independent*
   *  carrier noise sources, each shaped by their own envelope and summed, is what actually produces
   *  a layered "two textures at once" quality. */
  private buildLayer(ctx: AudioContext, recipe: GrainVariant, mixGainValue: number, sumNode: AudioNode): GrainLayer {
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
    carrierGain.gain.value = recipe.floor // base floor; the grain modulator adds the rest (see below)

    const mixGain = ctx.createGain()
    mixGain.gain.value = mixGainValue

    carrier.connect(bandpass).connect(highpass).connect(carrierGain).connect(mixGain).connect(sumNode)
    carrier.start()

    // ── Grain modulator: turns the carrier from smooth hiss into discrete
    //    micro-texture — see the class-level comment for why this exists. ──
    const modulator = ctx.createBufferSource()
    modulator.buffer = createNoiseBuffer(ctx) // independent buffer — must not correlate with the carrier
    modulator.loop = true

    const grainLowpass = ctx.createBiquadFilter()
    grainLowpass.type = 'lowpass'
    grainLowpass.frequency.value = recipe.minHz

    const grainNormGain = ctx.createGain()
    grainNormGain.gain.value = normGain(recipe.minHz, recipe.useNormGain)

    const rectify = ctx.createWaveShaper()
    rectify.curve = createGrainCurve(recipe.curvePower) // folds + sharpens the lowpassed noise into a spiky AM envelope

    const grainDepth = ctx.createGain()
    grainDepth.gain.value = recipe.depth

    modulator.connect(grainLowpass).connect(grainNormGain).connect(rectify).connect(grainDepth).connect(carrierGain.gain)
    modulator.start()

    return { recipe, bandpass, carrierGain, grainLowpass, grainNormGain, rectify, grainDepthGain: grainDepth, mixGain }
  }

  /** Builds the audio graph on first use and leaves every noise source looping for the module's
   *  lifetime (muted via `masterGain` between strokes) — cheaper and simpler than tearing down/
   *  recreating AudioBufferSourceNodes per stroke, since a source can only ever be started once.
   *  Must be reached from a real user gesture the first time (pointerdown qualifies) — that's why
   *  this is lazy rather than built in the constructor. */
  private ensureGraph(): AudioGraph {
    if (this.graph) return this.graph
    const ctx = new AudioContext()

    const layerSum = ctx.createGain()
    layerSum.gain.value = 1

    const layers = [this.buildLayer(ctx, this.grain, 1, layerSum)]
    if (this.grain.secondary) {
      layers.push(this.buildLayer(ctx, this.grain.secondary.variant, this.grain.secondary.gain, layerSum))
    }

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

    layerSum
      .connect(tiltLowpass).connect(lowShelf).connect(hardnessShelf)
      .connect(masterGain).connect(ctx.destination)

    this.graph = { ctx, layers, tiltLowpass, lowShelf, hardnessShelf, masterGain }
    return this.graph
  }
}

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
  // Round 13 (#153 Variant 3, take 3): touchdown tap, undefined = no tap at
  // all (Variant 1/2's exact prior behavior — a still stylus makes no
  // sound, full stop). When present, strokeStart plays a short *pre-baked*
  // click buffer (see PencilSound.createClickBuffer()/triggerTap()) —
  // deliberately not a live-gated BiquadFilterNode. Two earlier attempts
  // both gated an always-running noise source through a filter (once after
  // it, once before it) and both still read as "noise with a volume
  // envelope" rather than a clean percussive tick, because the filter (or
  // its excitation) kept processing live randomness for long enough to stay
  // audibly noisy. Baking an exact impulse response (a single-sample kick
  // into a 2-pole resonator, computed once into an AudioBuffer, blended
  // with a very brief separate noise transient for "contact" texture) has
  // no such ambiguity — the waveform is authored exactly, not emergent from
  // gate timing. freqHz/decaySeconds/noiseMix shape it; gain scales with
  // pressure between minGain and maxGain via pressure^pressureCurve (1 =
  // linear; >1 pulls light/medium presses down further while leaving
  // maxGain, at pressure=1, unchanged — see triggerTap()); bypasses
  // masterGain the same way the earlier attempts did (masterGain is
  // speed-driven, ~0 at touchdown).
  tap?: { minGain: number; maxGain: number; freqHz: number; decaySeconds: number; noiseMix: number; pressureCurve: number }
  // Texture presence (both the constant noise floor *and* grain peak
  // loudness) scales with speed too, not just grain rate — a slow stroke's
  // texture should be quieter and softer overall, not just its occasional
  // spikes. 1 (or omitted) = no scaling, Variant 1/2's prior behavior;
  // otherwise the floor at zero speed, ramping (speed^1.4, not linear — see
  // applyTarget()) up to full (1) at max speed.
  speedPresenceFloor?: number
  // Flat multiplier on the friction texture's overall loudness (masterGain
  // — bed/grain, not the tap, which has its own minGain/maxGain). 1 (or
  // omitted) = no change, Variant 1/2's prior behavior.
  outputGainScale?: number
  // Multiplier on the carrier bandpass's swept center frequency (see
  // brightnessFreq()) — shifts the whole MIN_FREQ..MAX_FREQ sweep down
  // proportionally, i.e. duller/breathier ("фффф") rather than sibilant/
  // hissy ("щщщщ") without changing its shape. 1 (or omitted) = no change,
  // Variant 1/2's prior behavior.
  brightnessScale?: number
  // Multiplier on bandpassQ() — a lower Q is a broader/less resonant peak,
  // softer/less "peaky" overall. 1 (or omitted) = no change, Variant 1/2's
  // prior behavior.
  qScale?: number
  // Extra tone-vs-speed dependence, layered on top of brightnessScale rather
  // than replacing it: adds (brightnessRangeBoost-1) * speedT * (the scaled
  // MIN_FREQ..MAX_FREQ span) on top of brightnessFreq()'s own output, i.e.
  // the low-speed tone is untouched (the added term is 0 at speedT=0) but
  // higher speeds sweep further up than brightnessScale alone would put
  // them — widens the range instead of just shifting it. 1 (or omitted) =
  // no extra effect, Variant 1/2's prior behavior.
  brightnessRangeBoost?: number
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

// Round 13 (#153, take 6): Variant 1's exact recipe plus a light,
// pressure-scaled touchdown tap and speed-scaled texture presence — the two
// things Ilya asked for after the from-scratch AudioWorklet rewrite
// (distance-triggered grains, modal resonator body, non-noise touchdown
// click) didn't read as better than Variant 1 despite being "more
// physically correct" on paper. outputGainScale halves the friction texture
// overall (not the tap) — see applyTarget()'s use of it. tap's minGain
// dropped and pressureCurve=2.2 added (a light touch is quieter than a
// medium one, not just a smaller offset above the same floor) while maxGain
// is untouched (a firm press should still land about where it already did).
// brightnessScale 0.45 pulls the carrier's sibilant "щщщ" hiss down toward
// a duller, breathier "фффф"; tap freqHz dropped again (180→120, deeper
// still). curvePower dropped from Variant 1's inherited 4.0 (sharp, spiky
// grain envelope — "most of the cycle near-silent, brief sharp spikes") to
// 2.0 (rounder/softer), and qScale 0.6 broadens the bandpass peak (less
// resonant/"peaky") — both asked for as "softer" noise, distinct from
// "quieter" (outputGainScale, already turned down a round ago).
export const PENCIL_SOUND_VARIANT_3: GrainVariant = {
  ...PENCIL_SOUND_VARIANT_1,
  tap: { minGain: 0.02, maxGain: 0.5, freqHz: 120, decaySeconds: 0.02, noiseMix: 0.35, pressureCurve: 2.2 },
  speedPresenceFloor: 0.08,
  outputGainScale: 0.5,
  brightnessScale: 0.45,
  curvePower: 2.0,
  qScale: 0.6,
  // Asked whether tone tracks speed and to strengthen it — it already did
  // (brightnessFreq()'s own sweep, just scaled down by brightnessScale), so
  // this widens the sweep rather than introducing a new mechanism: at low
  // speed nothing changes, at high speed the tone reaches noticeably higher
  // than brightnessScale alone would put it.
  brightnessRangeBoost: 1.6,
}

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

/** Bakes an exact impulse response for GrainVariant.tap: a single-sample
 *  kick into a 2-pole resonator (same r/a1/a2 math a modal synth would use),
 *  computed once into a mono AudioBuffer and blended with a very brief
 *  separate noise transient (the first `noiseMix`-weighted ~1.5ms) for
 *  "contact" texture. See GrainVariant.tap's docstring for why this exists
 *  as a pre-baked buffer rather than a live-gated BiquadFilterNode — two
 *  earlier live-graph attempts both still read as noise with an envelope. */
function createClickBuffer(ctx: AudioContext, freqHz: number, decaySeconds: number, noiseMix: number): AudioBuffer {
  const n = Math.max(8, Math.round(ctx.sampleRate * decaySeconds * 6))
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  const r = Math.exp(-1 / (decaySeconds * ctx.sampleRate))
  const a1 = 2 * r * Math.cos((2 * Math.PI * freqHz) / ctx.sampleRate)
  const a2 = -r * r
  let y1 = 0
  let y2 = 0
  const noiseSamples = Math.round(ctx.sampleRate * 0.0015)
  for (let i = 0; i < n; i++) {
    const impulse = i === 0 ? 1 : 0
    const y = (1 - r) * impulse + a1 * y1 + a2 * y2
    y2 = y1; y1 = y
    const noise = i < noiseSamples ? (Math.random() * 2 - 1) * (1 - i / noiseSamples) : 0
    data[i] = y * (1 - noiseMix) + noise * noiseMix
  }
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
  // Downstream of masterGain — lets the touchdown tap bypass it (masterGain
  // is speed-driven, ~0 exactly at the touchdown moment).
  outputSum: GainNode
  // Touchdown tap (see GrainVariant.tap) — null when this.grain.tap is
  // undefined. tapBuffer is the pre-baked click waveform (built once, see
  // createClickBuffer()); triggerTap() plays a fresh one-shot source from
  // it per tap, same pattern as any other short one-off sound effect.
  tapBuffer: AudioBuffer | null
}

// Room/index.tsx's ref type for the active pencil-sound engine. Only
// PencilSound implements this now — round 13 retired the AudioWorklet-based
// lib/pencilSoundV3/ engine variant3 used to route to (see
// PENCIL_SOUND_TUNING_LOG.md) — but the interface stays as the contract
// Room/index.tsx codes against, independent of the implementation.
export interface PencilSoundAPI {
  setHardness(hardness: number): void
  start(pressure: number, speed: number, tiltX?: number, tiltY?: number): void
  update(pressure: number, speed: number, tiltX?: number, tiltY?: number): void
  stop(): void
  destroy(): void
}

export class PencilSound implements PencilSoundAPI {
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
    this.triggerTap(graph, pressure)
    if (this.idleTimer === null) {
      this.idleTimer = window.setInterval(() => this.checkIdle(), IDLE_CHECK_MS)
    }
  }

  /** Touchdown click (see GrainVariant.tap) — plays a fresh one-shot source
   *  from the pre-baked tapBuffer, gain scaled by pressure. A one-shot
   *  BufferSourceNode per tap is fine (unlike the continuously-looping
   *  carriers elsewhere) — it's a short, infrequent sound, not a graph worth
   *  keeping alive between strokes. No-op when this.grain.tap is undefined
   *  (Variant 1/2). */
  private triggerTap(graph: AudioGraph, pressure: number): void {
    if (!graph.tapBuffer || !this.grain.tap) return
    const { minGain, maxGain, pressureCurve } = this.grain.tap
    const t = Math.pow(Math.max(0, Math.min(1, pressure)), pressureCurve)
    const peak = minGain + (maxGain - minGain) * t
    const source = graph.ctx.createBufferSource()
    source.buffer = graph.tapBuffer
    const gain = graph.ctx.createGain()
    gain.gain.value = peak
    source.connect(gain).connect(graph.outputSum)
    source.start()
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
    const speedT = speedNorm(speed)
    for (const layer of graph.layers) {
      // Round 13 (see GrainVariant.brightnessScale): shifts the carrier's
      // whole sweep range down proportionally — "фффф" (breathier, lower)
      // instead of "щщщщ" (sibilant/hissy) — without changing its shape.
      // brightnessRangeBoost then adds extra spread on top, scaled by
      // speedT so the low-speed tone (speedT≈0) is untouched — see its own
      // field doc.
      const scale = layer.recipe.brightnessScale ?? 1
      const rangeBoost = layer.recipe.brightnessRangeBoost ?? 1
      const extraSpread = (rangeBoost - 1) * speedT * (MAX_FREQ - MIN_FREQ) * scale
      layer.bandpass.frequency.setTargetAtTime(brightness * scale + extraSpread, now, BRIGHTNESS_RAMP)
      layer.bandpass.Q.setTargetAtTime(q * (layer.recipe.qScale ?? 1), now, RAMP_SLOW)
      const grainRate = grainRateHz(speed, layer.recipe.minHz, layer.recipe.maxHz)
      layer.grainLowpass.frequency.setTargetAtTime(grainRate, now, RAMP_SLOW)
      // Compensates the lowpass's frequency-dependent attenuation (see normGain's docstring) so the
      // WaveShaper downstream always sees a consistently-scaled signal as the rate sweeps with speed.
      layer.grainNormGain.gain.setTargetAtTime(normGain(grainRate, layer.recipe.useNormGain), now, RAMP_SLOW)
      // Round 13 (see GrainVariant.speedPresenceFloor): both the constant
      // noise floor *and* grain peaks scale down toward that floor as the
      // stroke slows, not just grain rate — a slow stroke's whole texture
      // should be quieter and softer, not just its occasional spikes (an
      // earlier version only scaled grain depth, leaving the floor exactly
      // as loud at any speed, which is most of why a slow line still
      // "rustled" as much as a fast one — floor dominates depth-0.02
      // Variant 1-derived recipes). speedT^1.4 (not linear) keeps things
      // noticeably soft through low-to-mid speed, not just right at the
      // very bottom of the range.
      const presenceFloor = layer.recipe.speedPresenceFloor ?? 1
      const presenceScale = presenceFloor + (1 - presenceFloor) * Math.pow(speedT, 1.4)
      layer.carrierGain.gain.setTargetAtTime(layer.recipe.floor * presenceScale, now, RAMP_SLOW)
      layer.grainDepthGain.gain.setTargetAtTime(layer.recipe.depth * presenceScale, now, RAMP_SLOW)
    }
    graph.tiltLowpass.frequency.setTargetAtTime(tiltLowpassFreq(tiltX, tiltY), now, RAMP_SLOW)
    const master = masterGainTarget(pressure, speed, this.paperFactor) * (this.grain.outputGainScale ?? 1)
    graph.masterGain.gain.setTargetAtTime(master, now, RAMP_FAST)
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

    // Summing node downstream of masterGain — lets the touchdown tap (built
    // below, if this.grain.tap is set) bypass masterGain entirely. Needed
    // because masterGain is speed-driven and sits at ~0 exactly at the
    // touchdown moment (see masterGainTarget: t<=0 → 0), the same reason
    // `lift`/`transient` bypassed `gain` in the AudioWorklet take on this.
    const outputSum = ctx.createGain()
    outputSum.gain.value = 1
    outputSum.connect(ctx.destination)

    layerSum
      .connect(tiltLowpass).connect(lowShelf).connect(hardnessShelf)
      .connect(masterGain).connect(outputSum)

    const tapBuffer = this.grain.tap
      ? createClickBuffer(ctx, this.grain.tap.freqHz, this.grain.tap.decaySeconds, this.grain.tap.noiseMix)
      : null

    this.graph = { ctx, layers, tiltLowpass, lowShelf, hardnessShelf, masterGain, outputSum, tapBuffer }
    return this.graph
  }
}

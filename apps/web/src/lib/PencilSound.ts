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

// Every module-level numeric knob that isn't part of a GrainVariant recipe
// (deadzone/speed curve shape/global filter ranges/ramp times) used to be a
// plain `const`. The live-tuning debug panel (Room/PencilSoundTuningPanel.tsx,
// #153 round 13) needs to nudge these too, not just per-recipe fields, so
// they're grouped into one mutable, exported object instead. Every read site
// below reads straight from PENCIL_SOUND_TUNING rather than a closed-over
// const, so mutating a field here takes effect on the very next
// applyTarget()/masterGainTarget()/checkIdle() call — all of which run
// continuously while a stroke is active — with no rebuild or subscription
// mechanism needed. Two fields (lowShelfFreq/hardnessShelfFreq) are the
// exception — see PencilSound.retuneGlobals()'s comment for why.
export interface PencilSoundTuning {
  // Narrowed from an original 500-6000 (see brightnessRamp below for why) —
  // a narrower sweep range plus a much slower glide both reduce how far and
  // how fast the bandpass center chases every small speed fluctuation mid-
  // stroke; that combination (narrow resonant filter + wide, fast sweep) is
  // exactly what a wind-siren/wah effect is built from.
  minFreq: number
  maxFreq: number
  maxSpeed: number // px/ms — strokes faster than this just clamp to maxFreq/full gain
  speedDeadzone: number // px/ms — below this: no perceptible motion, so no sound at all
  gainCeiling: number // hard cap regardless of how loud pressure/paper push it
  idleMs: number // no fresh pointer sample within this window → treat as stopped
  rampFast: number // gain — must react almost instantly to stopping/starting
  rampSlow: number // filter sweeps — smoother so they don't zipper
  // Brightness gets its own, much slower ramp than other filter sweeps
  // (rampSlow) — a fast glide across a wide pitch range is exactly what read
  // as "howling wind"/siren rather than paper.
  brightnessRamp: number
  hardnessShelfFreq: number
  hardnessShelfMinDb: number // softest pencil: darker
  hardnessShelfMaxDb: number // hardest pencil: brighter/drier
  lowShelfFreq: number
  lowShelfMinDb: number // hardest pencil: no extra low-mid warmth
  lowShelfMaxDb: number // softest pencil: a bit of "deeper/velvety" body
  tiltMaxDeg: number // typical PointerEvent tiltX/Y span; clamp beyond this
  tiltLowpassMaxHz: number // near-upright: no extra darkening
  tiltLowpassMinHz: number // heavily tilted: duller, broader-contact tone
  // masterGainTarget's speed→loudness curve: exponent on speedNorm(speed).
  // Round 13 take 10: was 0.5 (Math.sqrt) — sub-linear, loudest relative to
  // input right off the deadzone — flipped to super-linear (quiet near the
  // deadzone, ramping up later) because slow strokes read as unnaturally
  // loud at 0.5.
  masterSpeedExponent: number
  pressureFloor: number // masterGainTarget's pressureFactor = pressureFloor + pressure*pressureScale
  pressureScale: number
  masterOutputScale: number // flat multiplier after speed/pressure/paper, before gainCeiling clamp
  qBase: number // bandpassQ(pressure) = qBase + pressure*qPressureScale
  qPressureScale: number // harder press → narrower/more resonant → "denser scratch"
}

export const PENCIL_SOUND_TUNING: PencilSoundTuning = {
  minFreq: 1200,
  maxFreq: 5000,
  maxSpeed: 6,
  speedDeadzone: 0.12,
  gainCeiling: 0.5,
  idleMs: 60,
  rampFast: 0.02,
  rampSlow: 0.05,
  brightnessRamp: 0.18,
  hardnessShelfFreq: 2200,
  hardnessShelfMinDb: -6,
  hardnessShelfMaxDb: 8,
  lowShelfFreq: 300,
  lowShelfMinDb: 0,
  lowShelfMaxDb: 5,
  tiltMaxDeg: 70,
  tiltLowpassMaxHz: 9000,
  tiltLowpassMinHz: 1800,
  // Round 13, take 11: reverted from take 10's 1.6 back to the original 0.5
  // (Math.sqrt) — see PENCIL_SOUND_VARIANT_3's own take-11 note; the take-10
  // rationale for 1.6 (below, on masterGainTarget) stays as a record of what
  // was tried, but 0.5 is what's live again.
  masterSpeedExponent: 0.5,
  pressureFloor: 0.5,
  pressureScale: 0.9,
  masterOutputScale: 0.4,
  qBase: 0.7,
  qPressureScale: 1.2,
}

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
//
// Round 13, take 8: Ilya's next listening pass, still too "щщщ" and the tap
// still doesn't read as a table. Measured `temp/Write on Paper with Pencil
// 02/03.wav` (offline FFT — rms/crest/macroCV/spectral centroid+flatness/
// per-band energy, no reference audio in the repo before this) to check the
// direction rather than guess further: both recordings have spectral
// flatness 0.55-0.63 (well short of 1.0 = white noise, but nowhere near a
// pure tone either) and almost no energy in 1-4kHz specifically (1.3-3.6%
// per band) — i.e. real pencil friction noise is broad and fairly weak right
// where our bandpass peak (Q ~0.5-1.1 after the existing qScale) still sits,
// which is consistent with that peak still reading as a whistly "щ" rather
// than breath. Both recordings also show their strongest single spectral
// peak at 156-275Hz — right in the tap's target range, confirming lower/
// duller (not higher) is the correct direction for the touchdown click too.
// Continued both trends one step further:
//   - brightnessScale 0.45→0.35, qScale 0.6→0.45: sweep shifted down again
//     and the resonant peak broadened further (less "peaky"/tonal, closer to
//     the measured flatness).
//   - tap.freqHz 120→85 (deeper still, toward the measured 156-275Hz body
//     peak), tap.decaySeconds 0.02→0.03 (a couple more cycles to ring before
//     decaying, so the low tone actually registers as a thud instead of
//     being over almost immediately), tap.noiseMix 0.35→0.18 (the "contact"
//     blend is raw, unfiltered white noise for its first ~1.5ms — full-
//     band and disproportionately bright next to an 85Hz tone, which is
//     plausibly why the click still read as "high" even after freqHz kept
//     dropping in earlier rounds; cut back rather than removed, some contact
//     transient is still wanted).
//
// Round 13, take 9: "still not enough" after take 8 — right direction, too
// timid a step on both axes (take 8's deltas were ~25-30% moves; every prior
// round that actually landed a confirmed improvement moved 33-40%+ at a
// time). Pushed both trends much harder rather than inching further:
//   - brightnessScale 0.35→0.22, qScale 0.45→0.28 — sweep down again and the
//     peak broadened again; at qScale 0.28 the bandpass Q is ~0.3-0.5
//     (was ~0.5-1.1 two rounds ago), close to the "no audible pitch to
//     track" end rather than "still a bit narrow."
//   - tap.freqHz 85→50 (sub-bass thump range, not just "low"), decaySeconds
//     0.03→0.045 (more like a boom, more ring time), noiseMix 0.18→0.08
//     (the raw-white-noise contact blend cut back again — at 50Hz even a
//     small unfiltered-noise fraction reads disproportionately bright).
// If this overshoots — reads as *too* dull/muffled, or the tap disappears
// entirely rather than deepens — that's useful signal on its own (means the
// target is between take 8 and take 9, not past take 9), so say which axis
// specifically (noise texture vs. tap pitch) rather than "still not enough"
// again, since both moved this round and only one may need to come back up.
//
// Round 13, take 10: two specific, separate notes — slow strokes still sound
// unnaturally loud, and the tap "definitely" needs to go lower still. Noise
// *texture* (brightnessScale/qScale/curvePower) left untouched this round —
// Ilya hasn't pinned down what's still off about it, and both loudness axes
// below are orthogonal to timbre, so no reason to touch it blind.
//   - tap.freqHz 50→32 (proper sub-bass), decaySeconds 0.045→0.06 (more ring,
//     gives the low fundamental time to actually register instead of the
//     brief attack transient dominating what's heard), noiseMix 0.08→0.04
//     (that raw-noise "contact" blend is a likely reason it kept reading
//     "high" even as freqHz dropped every round so far — a percussive
//     attack's perceived brightness is carried mostly by its transient, not
//     its steady-state tone, so even a small broadband fraction can
//     dominate the ear's read of "pitch").
//   - masterGainTarget's speedGain curve (see its own comment) flipped from
//     sub-linear (sqrt, loud right off the deadzone) to super-linear
//     (`t^1.6`, quiet at low speed, ramping later) — this is the main lever
//     for "unnatural at slow speed," not speedPresenceFloor (which only
//     scales the grain layer's own floor/depth, not overall master level).
//     speedPresenceFloor's own floor also nudged down (0.08→0.05) as a
//     smaller second-order assist in the same direction.
//
// Round 13, take 11: reverted takes 8-10 back to take 6's values (tap
// freqHz/decaySeconds/noiseMix, speedPresenceFloor, brightnessScale, qScale,
// and PENCIL_SOUND_TUNING.masterSpeedExponent — see below). Ilya wants to
// pick up tuning himself from here using the live debug panel
// (Room/PencilSoundTuningPanel.tsx, built this same session) rather than
// continue blind by-ear rounds through Claude — takes 8-10's reasoning stays
// above as a record of what was tried and why, in case it's worth
// revisiting, but none of it is currently live.
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

// How often checkIdle() polls — not itself an audible parameter (just a
// watchdog cadence), so left out of PENCIL_SOUND_TUNING.
const IDLE_CHECK_MS = 30

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
  const s = Math.max(0, speed - PENCIL_SOUND_TUNING.speedDeadzone)
  return Math.min(1, s / (PENCIL_SOUND_TUNING.maxSpeed - PENCIL_SOUND_TUNING.speedDeadzone))
}

function hardnessT(hardness: number): number {
  // PENCIL_PRESETS clamps hardness to [0.05, 0.95] — normalize that to 0..1.
  return Math.min(1, Math.max(0, (hardness - 0.05) / 0.9))
}

function brightnessFreq(speed: number, hardness: number): number {
  const t = speedNorm(speed)
  const hardnessBias = (hardnessT(hardness) - 0.5) * 1200
  const { minFreq, maxFreq } = PENCIL_SOUND_TUNING
  return Math.min(maxFreq, Math.max(minFreq, minFreq + t * (maxFreq - minFreq) + hardnessBias))
}

function grainRateHz(speed: number, minHz: number, maxHz: number): number {
  return minHz + speedNorm(speed) * (maxHz - minHz)
}

function bandpassQ(pressure: number): number {
  // harder press → narrower/more resonant → "denser scratch"
  return PENCIL_SOUND_TUNING.qBase + Math.max(0, pressure) * PENCIL_SOUND_TUNING.qPressureScale
}

function masterGainTarget(pressure: number, speed: number, paperFactor: number): number {
  const t = speedNorm(speed)
  if (t <= 0) return 0
  // Round 13, take 10 tried flipping this from sub-linear (0.5/Math.sqrt,
  // loudest relative to input right off the deadzone — 0.1^0.5≈0.32) to
  // super-linear (1.6: quiet near the deadzone, ramping up later) to fix
  // "slow strokes sound unnatural." Take 11 reverted to 0.5 — Ilya's tuning
  // from here on out via the live debug panel, see PENCIL_SOUND_TUNING's
  // masterSpeedExponent field for the current default.
  const speedGain = Math.pow(t, PENCIL_SOUND_TUNING.masterSpeedExponent)
  const pressureFactor = PENCIL_SOUND_TUNING.pressureFloor + Math.max(0, pressure) * PENCIL_SOUND_TUNING.pressureScale
  return Math.min(PENCIL_SOUND_TUNING.gainCeiling, speedGain * pressureFactor * paperFactor * PENCIL_SOUND_TUNING.masterOutputScale)
}

function tiltNorm(tiltX: number, tiltY: number): number {
  return Math.min(1, Math.hypot(tiltX, tiltY) / PENCIL_SOUND_TUNING.tiltMaxDeg)
}

function tiltLowpassFreq(tiltX: number, tiltY: number): number {
  const { tiltLowpassMaxHz, tiltLowpassMinHz } = PENCIL_SOUND_TUNING
  return tiltLowpassMaxHz - tiltNorm(tiltX, tiltY) * (tiltLowpassMaxHz - tiltLowpassMinHz)
}

function hardnessShelfDb(hardness: number): number {
  const t = hardnessT(hardness)
  return PENCIL_SOUND_TUNING.hardnessShelfMinDb + t * (PENCIL_SOUND_TUNING.hardnessShelfMaxDb - PENCIL_SOUND_TUNING.hardnessShelfMinDb)
}

function lowShelfDb(hardness: number): number {
  const t = 1 - hardnessT(hardness)
  return PENCIL_SOUND_TUNING.lowShelfMinDb + t * (PENCIL_SOUND_TUNING.lowShelfMaxDb - PENCIL_SOUND_TUNING.lowShelfMinDb)
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
    this.graph.hardnessShelf.gain.setTargetAtTime(hardnessShelfDb(hardness), now, PENCIL_SOUND_TUNING.rampSlow)
    this.graph.lowShelf.gain.setTargetAtTime(lowShelfDb(hardness), now, PENCIL_SOUND_TUNING.rampSlow)
  }

  /** Live-tunes the active recipe (debug/tuning panel only). Most
   *  GrainVariant fields are read fresh every applyTarget() call, so
   *  mutating them in place is enough — no rebuild needed. curvePower bakes
   *  a WaveShaper curve once at layer-build time and tap bakes an
   *  AudioBuffer once at graph-build time, so both are explicitly
   *  regenerated here instead of requiring the caller to know which fields
   *  are "live" and which aren't. */
  retune(patch: Partial<GrainVariant>): void {
    Object.assign(this.grain, patch)
    if (!this.graph) return
    if (patch.curvePower !== undefined) {
      for (const layer of this.graph.layers) layer.rectify.curve = createGrainCurve(layer.recipe.curvePower)
    }
    if (patch.tap !== undefined && this.grain.tap) {
      const { freqHz, decaySeconds, noiseMix } = this.grain.tap
      this.graph.tapBuffer = createClickBuffer(this.graph.ctx, freqHz, decaySeconds, noiseMix)
    }
  }

  /** Re-applies the two PENCIL_SOUND_TUNING fields that don't otherwise have
   *  a per-block call site to ride along with (shelf center frequencies —
   *  their *gain* already updates live via setHardness/hardnessShelfDb/
   *  lowShelfDb, but nothing else touches .frequency after ensureGraph()
   *  sets its initial value). Every other PENCIL_SOUND_TUNING field is read
   *  fresh by applyTarget()/masterGainTarget()/checkIdle() already. Debug/
   *  tuning panel only — call after mutating PENCIL_SOUND_TUNING. */
  retuneGlobals(): void {
    if (!this.graph) return
    const now = this.graph.ctx.currentTime
    const { lowShelfFreq, hardnessShelfFreq, rampSlow } = PENCIL_SOUND_TUNING
    this.graph.lowShelf.frequency.setTargetAtTime(lowShelfFreq, now, rampSlow)
    this.graph.hardnessShelf.frequency.setTargetAtTime(hardnessShelfFreq, now, rampSlow)
    this.graph.hardnessShelf.gain.setTargetAtTime(hardnessShelfDb(this.hardness), now, rampSlow)
    this.graph.lowShelf.gain.setTargetAtTime(lowShelfDb(this.hardness), now, rampSlow)
  }

  /** Current recipe snapshot — debug/tuning panel only, to seed its editable
   *  local state and for "copy config." */
  getGrain(): GrainVariant {
    return this.grain
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
    this.graph.masterGain.gain.setTargetAtTime(0, this.graph.ctx.currentTime, PENCIL_SOUND_TUNING.rampFast)
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
    if (performance.now() - this.lastSampleAt > PENCIL_SOUND_TUNING.idleMs) {
      this.graph.masterGain.gain.setTargetAtTime(0, this.graph.ctx.currentTime, PENCIL_SOUND_TUNING.rampFast)
    }
  }

  private applyTarget(graph: AudioGraph, pressure: number, speed: number, tiltX: number, tiltY: number): void {
    const now = graph.ctx.currentTime
    const { minFreq, maxFreq, brightnessRamp, rampSlow, rampFast } = PENCIL_SOUND_TUNING
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
      const extraSpread = (rangeBoost - 1) * speedT * (maxFreq - minFreq) * scale
      layer.bandpass.frequency.setTargetAtTime(brightness * scale + extraSpread, now, brightnessRamp)
      layer.bandpass.Q.setTargetAtTime(q * (layer.recipe.qScale ?? 1), now, rampSlow)
      const grainRate = grainRateHz(speed, layer.recipe.minHz, layer.recipe.maxHz)
      layer.grainLowpass.frequency.setTargetAtTime(grainRate, now, rampSlow)
      // Compensates the lowpass's frequency-dependent attenuation (see normGain's docstring) so the
      // WaveShaper downstream always sees a consistently-scaled signal as the rate sweeps with speed.
      layer.grainNormGain.gain.setTargetAtTime(normGain(grainRate, layer.recipe.useNormGain), now, rampSlow)
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
      layer.carrierGain.gain.setTargetAtTime(layer.recipe.floor * presenceScale, now, rampSlow)
      layer.grainDepthGain.gain.setTargetAtTime(layer.recipe.depth * presenceScale, now, rampSlow)
    }
    graph.tiltLowpass.frequency.setTargetAtTime(tiltLowpassFreq(tiltX, tiltY), now, rampSlow)
    const master = masterGainTarget(pressure, speed, this.paperFactor) * (this.grain.outputGainScale ?? 1)
    graph.masterGain.gain.setTargetAtTime(master, now, rampFast)
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
    tiltLowpass.frequency.value = PENCIL_SOUND_TUNING.tiltLowpassMaxHz

    const lowShelf = ctx.createBiquadFilter()
    lowShelf.type = 'lowshelf'
    lowShelf.frequency.value = PENCIL_SOUND_TUNING.lowShelfFreq
    lowShelf.gain.value = lowShelfDb(this.hardness)

    const hardnessShelf = ctx.createBiquadFilter()
    hardnessShelf.type = 'highshelf'
    hardnessShelf.frequency.value = PENCIL_SOUND_TUNING.hardnessShelfFreq
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

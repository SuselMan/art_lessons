// DSP core for pencil sound "Variant 3" (#153) — per-sample synthesis that
// runs inside an AudioWorklet. See index.ts for how this class gets there:
// it is serialized with `Variant3Synth.toString()` into a Blob module, so it
// MUST stay fully self-contained — no imports with runtime effect, no
// references to module-level constants or helpers, no WebAudio types. Type-
// only imports are fine (erased at compile time). Everything the class needs
// lives in its own fields/methods.
//
// Why a worklet instead of the node graph PencilSound.ts uses (see
// PENCIL_SOUND_TUNING_LOG.md rounds 1-10 for that design's history):
//   1. Grain excitation is tied to *distance traveled* (px of stroke), not
//      time — each grain is the tip crossing one paper asperity, so grain
//      density in time scales with speed automatically (correct physics for
//      free) and a stationary tip is structurally silent. The node graph's
//      grainRateHz(speed) curve hand-approximated this; here it falls out of
//      integrating speed.
//   2. A modal resonator bank gives the sound a "body" (paper sheet / pencil
//      / desk respond to each grain impact with a few decaying modes). The
//      node-graph variants are pure filtered noise with zero resonance —
//      a big part of why they read as synthetic.
//   3. Contact/lift transients: a real stroke starts with a distinct tip-
//      touchdown tap and ends with a lift-off flick. These play through
//      their own gain path (not the speed-driven master gain, which is ~0 at
//      those exact moments).
//   4. Stereo: bed noise is decorrelated L/R and each grain gets a slight
//      random pan — dry centered mono is another "synthesis" tell.
//   5. Per-sample smoothing everywhere — no setTargetAtTime zippering, and
//      the bed brightness sweep is a *non-resonant* one-pole, which is
//      structurally immune to the round-8 "howling wind" problem (that came
//      from sweeping a resonant bandpass).
//
// Tuning targets come from round 3's analysis of Ilya's real recordings:
// spectral centroid ≈ 5.7-6.7 kHz, envelope crest ≈ 11, macro RMS CV (50ms)
// ≈ 0.75, modulation energy spread over ~3-36 Hz. Round 6's lesson tempers
// them: an aggressively patchy synth measured "right" but sounded wrong —
// patchiness only reads as paper when it is *caused* by the excitation
// structure, so the bed modulation here is deliberately moderate and the
// texture comes mostly from the distance-triggered grains.

import type { PaperType } from '@art-lessons/shared'

export type V3Message =
  | { type: 'start'; pressure: number; tiltNorm: number }
  | { type: 'update'; speed: number; pressure: number; tiltNorm: number }
  | { type: 'stop' }
  | { type: 'config'; hardness: number; paper: PaperType }

export class Variant3Synth {
  private fs: number
  private msPerSample: number

  // ── control targets (set by messages) and their smoothed values ──
  private active = false
  private targetSpeed = 0    // px/ms, screen-space (matches PointerData.speed)
  private targetPressure = 0
  private targetTilt = 0     // 0..1 (precomputed tiltNorm)
  private speed = 0
  private pressure = 0
  private tilt = 0
  private sinceUpdate = 0    // samples since last start/update message
  private watchdogSamples: number

  // one-pole smoothing coefficients (per-sample)
  private kSpeed: number
  private kPressure: number
  private kTilt: number
  private kGainAtk: number
  private kGainRel: number
  private kPatch: number

  private gain = 0

  // ── paper / hardness derived params (set via 'config') ──
  private grainSpacingPx = 3.0
  private grainGainPaper = 1.0
  private paperGain = 1.0
  private hardT = 0.37       // normalized hardness 0..1 (soft..hard)
  private grainDecay = 0
  private hardBright = 1.0

  // ── grain state ──
  private distPx = 0
  private nextGrainAt = 0
  private grainEnvL = 0
  private grainEnvR = 0
  private grainHpState = 0
  private grainLpState = 0
  private grainLp2State = 0

  // ── bed state (two cascaded one-pole LPs → -12dB/oct; a single pole left
  //    too much energy above the cutoff and pushed the measured centroid to
  //    ~10kHz vs the real recordings' 5.7-6.7kHz) ──
  private bedCut = 3000      // Hz, smoothed at block rate
  private bedLpL = 0
  private bedLpR = 0
  private bedLp2L = 0
  private bedLp2R = 0
  private bedHpL = 0
  private bedHpR = 0
  private patch = 1          // slow sample-and-hold loudness patchiness
  private patchTarget = 1
  private patchCountdown = 0

  // ── modal resonator bank (4 modes × 2 channels) ──
  private modeFreq = [430, 1300, 2800, 5600]
  private modeTau = [0.035, 0.02, 0.012, 0.007]
  private modeBaseGain = [0.5, 0.55, 0.6, 0.5]
  private modeA1: number[] = [0, 0, 0, 0]
  private modeA2: number[] = [0, 0, 0, 0]
  private modeIn: number[] = [0, 0, 0, 0]
  private modeGain: number[] = [0, 0, 0, 0]
  private modeY1L = [0, 0, 0, 0]
  private modeY2L = [0, 0, 0, 0]
  private modeY1R = [0, 0, 0, 0]
  private modeY2R = [0, 0, 0, 0]

  // ── transients ──
  private tapEnv = 0
  private tapImpulsePending = 0
  private tapDecay: number
  private tapLpState = 0
  private kTapLp: number
  private liftEnv = 0
  private liftDecay: number

  // ── tilt lowpass (final, per channel) ──
  private tiltLpL = 0
  private tiltLpR = 0
  private kTiltLp = 1

  // fixed filter coefs
  private kGrainHp: number
  private kGrainLp = 1
  private kBedHp: number

  // ── mix levels ──
  private bedMix = 0.75
  private grainMix = 1.8
  private modeMix = 0.7
  private transientMix = 0.7
  private masterScale = 0.4
  private gainCeiling = 0.5
  private outScale = 0.9

  private rngState = 0x9e3779b9

  constructor(sampleRate: number) {
    this.fs = sampleRate
    this.msPerSample = 1000 / sampleRate
    this.watchdogSamples = Math.round(0.08 * sampleRate)
    this.kSpeed = this.tauCoef(0.05)
    this.kPressure = this.tauCoef(0.03)
    this.kTilt = this.tauCoef(0.1)
    this.kGainAtk = this.tauCoef(0.012)
    this.kGainRel = this.tauCoef(0.04)
    this.kPatch = this.tauCoef(0.04)
    this.tapDecay = Math.exp(-1 / (0.018 * sampleRate))
    this.liftDecay = Math.exp(-1 / (0.012 * sampleRate))
    this.kTapLp = this.freqCoef(280)
    this.kGrainHp = this.freqCoef(1200)
    this.kBedHp = this.freqCoef(350)
    this.grainDecay = Math.exp(-1 / (0.0018 * sampleRate))
    this.recomputeHardness()
  }

  private tauCoef(tauSeconds: number): number {
    return 1 - Math.exp(-1 / (tauSeconds * this.fs))
  }

  private freqCoef(hz: number): number {
    return 1 - Math.exp((-2 * Math.PI * hz) / this.fs)
  }

  // xorshift32 — deterministic so offline tests are reproducible
  private rnd(): number {
    let x = this.rngState
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.rngState = (x >>> 0) || 0x12345678
    return (this.rngState >>> 8) / 16777216
  }

  handleMessage(m: V3Message): void {
    if (m.type === 'update') {
      this.targetSpeed = m.speed
      this.targetPressure = m.pressure
      this.targetTilt = m.tiltNorm
      this.sinceUpdate = 0
    } else if (m.type === 'start') {
      this.active = true
      this.targetPressure = m.pressure
      this.targetTilt = m.tiltNorm
      this.sinceUpdate = 0
      // touchdown tap — scaled by the *message's* pressure (the smoothed one
      // hasn't caught up yet at this exact moment)
      this.tapEnv = 0.35 + 0.65 * Math.max(0, Math.min(1, m.pressure))
      this.tapImpulsePending = 1.5 * this.tapEnv
      // re-arm the grain threshold so a new stroke doesn't inherit a stale one
      this.nextGrainAt = this.distPx + this.grainSpacingPx * (0.6 + 0.8 * this.rnd())
    } else if (m.type === 'stop') {
      if (this.active) this.liftEnv = 0.12 + 0.25 * this.pressure
      this.active = false
      this.targetSpeed = 0
    } else if (m.type === 'config') {
      // PENCIL_PRESETS clamps hardness to [0.05, 0.95] — normalize to 0..1
      this.hardT = Math.min(1, Math.max(0, (m.hardness - 0.05) / 0.9))
      if (m.paper === 'rough') {
        this.grainSpacingPx = 3.0; this.grainGainPaper = 1.0; this.paperGain = 1.0
      } else if (m.paper === 'smooth') {
        this.grainSpacingPx = 4.5; this.grainGainPaper = 0.7; this.paperGain = 0.8
      } else {
        this.grainSpacingPx = 6.5; this.grainGainPaper = 0.45; this.paperGain = 0.62
      }
      this.recomputeHardness()
    }
  }

  private recomputeHardness(): void {
    // harder pencil: brighter bed, shorter/sharper grain ticks; softer:
    // duller, longer "smearier" grains and more low-mode body
    this.hardBright = 0.85 + 0.6 * this.hardT
    this.grainDecay = Math.exp(-1 / ((0.0022 - 0.0012 * this.hardT) * this.fs))
    this.kGrainLp = this.freqCoef(4500 + 4000 * this.hardT) // grains live in a ~1.2-8kHz band, brighter for hard leads
    const soft = 1 - this.hardT
    for (let m = 0; m < 4; m++) {
      const r = Math.exp(-1 / (this.modeTau[m] * this.fs))
      this.modeA1[m] = 2 * r * Math.cos((2 * Math.PI * this.modeFreq[m]) / this.fs)
      this.modeA2[m] = -r * r
      this.modeIn[m] = 1 - r
      this.modeGain[m] = this.modeBaseGain[m] * (m < 2 ? 1 + 0.8 * soft : 1)
    }
  }

  private speedNorm(speed: number): number {
    const t = (speed - 0.12) / (6 - 0.12)
    return t < 0 ? 0 : t > 1 ? 1 : t
  }

  /** Renders one block into the given channel buffers (may be the same array
   *  for mono). Buffers may be any length — offline tests use big ones. */
  render(outL: Float32Array, outR: Float32Array): void {
    const n = outL.length
    // block-rate smoothing for filter cutoffs (they move slowly; recomputing
    // exp() per sample buys nothing) — deliberately slow (tau 0.15s), same
    // lesson as round 8's BRIGHTNESS_RAMP
    const kBlockBright = 1 - Math.exp(-(n / this.fs) / 0.15)
    const bedCutTarget = (1800 + 5200 * this.speedNorm(this.speed)) * this.hardBright
    this.bedCut += kBlockBright * (bedCutTarget - this.bedCut)
    const kBed = this.freqCoef(Math.min(this.bedCut, 10000))
    const tiltCut = 9000 - this.tilt * (9000 - 1800)
    this.kTiltLp = this.freqCoef(tiltCut)

    for (let i = 0; i < n; i++) {
      // watchdog: a stylus held perfectly still sends no pointer events at
      // all (see PointerInput), so decay speed toward 0 on our own
      this.sinceUpdate++
      if (this.active && this.sinceUpdate > this.watchdogSamples) this.targetSpeed = 0

      this.speed += this.kSpeed * (this.targetSpeed - this.speed)
      this.pressure += this.kPressure * (this.targetPressure - this.pressure)
      this.tilt += this.kTilt * (this.targetTilt - this.tilt)

      const t = this.speedNorm(this.speed)
      const gTarget = this.active && t > 0
        ? Math.min(this.gainCeiling, Math.sqrt(t) * (0.35 + 0.9 * this.pressure) * this.paperGain * this.masterScale)
        : 0
      this.gain += (gTarget > this.gain ? this.kGainAtk : this.kGainRel) * (gTarget - this.gain)

      // ── grains: one per paper asperity crossed ──
      this.distPx += this.speed * this.msPerSample
      if (this.active && this.distPx >= this.nextGrainAt) {
        const u = this.rnd()
        // heavy-tailed amplitudes (u^5): most grains near-inaudible ticks,
        // the occasional big one is the "гк"; patch² ties grain size to the
        // same local-tooth-density patchiness that modulates the bed
        const amp = (0.15 + 2.5 * u * u * u * u * u) * (0.4 + 0.8 * this.pressure)
          * this.grainGainPaper * this.patch * this.patch
        const w = 0.5 + (this.rnd() - 0.5) * 0.55 // slight random pan per grain
        this.grainEnvL += amp * (1 - w)
        this.grainEnvR += amp * w
        this.nextGrainAt = this.distPx + this.grainSpacingPx * (0.6 + 0.8 * this.rnd())
      }
      this.grainEnvL *= this.grainDecay
      this.grainEnvR *= this.grainDecay
      const gNoiseRaw = this.rnd() * 2 - 1
      this.grainHpState += this.kGrainHp * (gNoiseRaw - this.grainHpState)
      const gHp = gNoiseRaw - this.grainHpState // grains are bright: HP ~1.2 kHz…
      this.grainLpState += this.kGrainLp * (gHp - this.grainLpState) // …but not white-bright:
      this.grainLp2State += this.kGrainLp * (this.grainLpState - this.grainLp2State) // 2-pole LP ~4.5-8.5k
      const gNoise = this.grainLp2State
      const exGL = this.grainEnvL * gNoise
      const exGR = this.grainEnvR * gNoise // same noise both sides → point-source grain, panned by amplitude

      // ── bed: decorrelated L/R colored noise with slow patchiness ──
      const nL = this.rnd() * 2 - 1
      const nR = this.rnd() * 2 - 1
      this.bedLpL += kBed * (nL - this.bedLpL)
      this.bedLpR += kBed * (nR - this.bedLpR)
      this.bedLp2L += kBed * (this.bedLpL - this.bedLp2L)
      this.bedLp2R += kBed * (this.bedLpR - this.bedLp2R)
      this.bedHpL += this.kBedHp * (this.bedLp2L - this.bedHpL)
      this.bedHpR += this.kBedHp * (this.bedLp2R - this.bedHpR)
      let bedL = this.bedLp2L - this.bedHpL
      let bedR = this.bedLp2R - this.bedHpR
      if (--this.patchCountdown <= 0) {
        // sample-and-hold + glide: modulation depth is exact by construction
        // (no lowpassed-noise amplitude surprises — the round-2/3 bug class);
        // exponential shape so "more tooth" patches swing further up than
        // "less tooth" ones swing down (range ≈ 0.55-1.8×)
        this.patchTarget = Math.exp(0.6 * (this.rnd() * 2 - 1))
        this.patchCountdown = Math.round((0.03 + 0.1 * this.rnd()) * this.fs)
      }
      this.patch += this.kPatch * (this.patchTarget - this.patch)
      bedL *= this.patch
      bedR *= this.patch

      // ── transients (own gain path — master gain is ~0 at touchdown/lift) ──
      this.tapLpState += this.kTapLp * ((this.rnd() * 2 - 1) - this.tapLpState)
      const tap = this.tapLpState * this.tapEnv * 6
      this.tapEnv *= this.tapDecay
      const lift = gNoise * this.liftEnv
      this.liftEnv *= this.liftDecay
      const transient = (tap + lift) * this.transientMix
      const tapKick = this.tapImpulsePending
      this.tapImpulsePending = 0

      // ── modal resonator bank: grains (and the touchdown kick) ping it ──
      const feedL = exGL + bedL * 0.12 + tapKick
      const feedR = exGR + bedR * 0.12 + tapKick
      let modesL = 0
      let modesR = 0
      for (let m = 0; m < 4; m++) {
        const yL = this.modeIn[m] * feedL + this.modeA1[m] * this.modeY1L[m] + this.modeA2[m] * this.modeY2L[m]
        this.modeY2L[m] = this.modeY1L[m]; this.modeY1L[m] = yL
        modesL += this.modeGain[m] * yL
        const yR = this.modeIn[m] * feedR + this.modeA1[m] * this.modeY1R[m] + this.modeA2[m] * this.modeY2R[m]
        this.modeY2R[m] = this.modeY1R[m]; this.modeY1R[m] = yR
        modesR += this.modeGain[m] * yR
      }

      let vL = this.gain * (this.bedMix * bedL + this.grainMix * exGL + this.modeMix * modesL) + transient
      let vR = this.gain * (this.bedMix * bedR + this.grainMix * exGR + this.modeMix * modesR) + transient
      this.tiltLpL += this.kTiltLp * (vL - this.tiltLpL)
      this.tiltLpR += this.kTiltLp * (vR - this.tiltLpR)
      vL = this.tiltLpL * this.outScale
      vR = this.tiltLpR * this.outScale
      outL[i] = vL > 1 ? 1 : vL < -1 ? -1 : vL
      outR[i] = vR > 1 ? 1 : vR < -1 ? -1 : vR
    }
  }
}

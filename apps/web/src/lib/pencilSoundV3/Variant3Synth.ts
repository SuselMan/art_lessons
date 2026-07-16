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
  // Round-12 tuning panel (PENCIL_SOUND_TUNING_LOG.md) — live A/B/C/D mix
  // overrides, no graph rebuild needed. Omitted fields keep their current value.
  | { type: 'tune'; bedMix?: number; grainMix?: number; patchDepth?: number }

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

  // ── bed state: resonant bandpass (biquad) over decorrelated L/R white
  //    noise. Rounds 1-12 used a non-resonant two-pole LP here specifically
  //    to dodge round-8's "howling wind" bug — but that bug came from a
  //    *wide, fast* resonant sweep, not resonance itself (Variant 1/2's
  //    node-graph BiquadFilterNode bandpass, Q 0.7-1.9, proves a resonant
  //    sweep works fine when it's narrow and not too fast). A non-resonant
  //    cutoff sweep has no audible peak for the ear to track sliding with
  //    speed, which is most of why the old bed read as flat "shshsh" that
  //    barely seemed to track speed even though its cutoff genuinely did
  //    move. Round 13: swapped in a proper resonant bandpass, kept to
  //    Variant 1/2's same narrow range + moderate Q to stay clear of round 8. ──
  private bedCut = 2400      // Hz, smoothed at block rate
  private bedB0 = 0
  private bedA1 = 0
  private bedA2 = 0
  private bedZ1L = 0
  private bedZ2L = 0
  private bedZ1R = 0
  private bedZ2R = 0
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
  // Round 13: touchdown used to be tapEnv/tapDecay/tapLpState driving an
  // ~18ms burst of filtered noise added straight to the output — that noise
  // burst *was* the "why is there rustle on a single dot" a plain tap
  // produced, and its pressure floor was high enough to read as "always
  // loud regardless of touch force". Replaced with a single one-sample
  // impulse (tapImpulsePending) ringing a small *dedicated* 2-pole resonator
  // (tapRing*) — a fixed-frequency tonal "click", not noise, so touchdown
  // reads as a tick rather than a hiss. It has to be a separate resonator
  // from the grain/bed modal bank below (not just feeding tapKick into it):
  // that bank's output is scaled by `gain`, which is ~0 whenever speed is
  // ~0 — exactly the touchdown/stationary-dot moment — so routing the click
  // through it would make it inaudible precisely when it needs to be heard
  // (confirmed by the offline test: a shared-bank version measured *silent*
  // on a standstill tap). This one bypasses `gain` like `lift` already does.
  private tapImpulsePending = 0
  private tapRingA1 = 0
  private tapRingA2 = 0
  private tapRingIn = 0
  private tapRingY1 = 0
  private tapRingY2 = 0
  private liftEnv = 0
  private liftDecay: number

  // ── tilt lowpass (final, per channel) ──
  private tiltLpL = 0
  private tiltLpR = 0
  private kTiltLp = 1

  // fixed filter coefs
  private kGrainHp: number
  private kGrainLp = 1

  // ── mix levels ──
  // Round 13: bedMix lowered / grainMix raised from round 12's own working
  // hypothesis (candidate C) — Ilya's listening pass confirmed the default
  // (candidate A) read as "plastic bag rustling" with grain barely audible
  // and texture not tracking stroke speed, i.e. the continuous bed floor was
  // masking the actual distance-triggered grain excitation.
  private bedMix = 0.45
  private grainMix = 2.3
  private modeMix = 0.7
  private transientMix = 0.7
  // Round 14: halved from 0.4 (Ilya: "шум весь в два раза тише"). Only
  // scales `gain`, which gates bedMix/grainMix/modeMix (the continuous
  // scratch texture) — `transient` (tap/lift, above) is additive and
  // bypasses `gain` entirely, so the touchdown click's own loudness is
  // untouched by this. Round 15: another 15% off (Ilya: "шум еще тише на 15%").
  private masterScale = 0.17
  private gainCeiling = 0.5
  private outScale = 0.9
  // exponent on the ±1 uniform draw behind patchTarget — round 12 tuning axis
  private patchDepth = 0.6

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
    this.liftDecay = Math.exp(-1 / (0.012 * sampleRate))
    this.kGrainHp = this.freqCoef(1200)
    this.grainDecay = Math.exp(-1 / (0.0018 * sampleRate))
    // Touchdown click resonator — fixed, still above the modal bank's bass
    // mode (430Hz) so the click doesn't blur into it, but dropped further
    // still from round 14's 900Hz (Ilya: "стук еще ниже") for a deeper
    // knock; short tau (~9ms) for a tick, not a ring.
    {
      const tapRingFreq = 600
      const rTap = Math.exp(-1 / (0.009 * sampleRate))
      this.tapRingA1 = 2 * rTap * Math.cos((2 * Math.PI * tapRingFreq) / sampleRate)
      this.tapRingA2 = -rTap * rTap
      this.tapRingIn = 1 - rTap
    }
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
      // touchdown click — scaled by the *message's* pressure (the smoothed
      // one hasn't caught up yet at this exact moment). Steep pow curve:
      // near-silent at a light touch, only a firm press rings the modal
      // bank noticeably — see the tapImpulsePending field comment.
      this.tapImpulsePending = 0.6 * Math.pow(Math.max(0, Math.min(1, m.pressure)), 1.6)
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
    } else if (m.type === 'tune') {
      if (m.bedMix !== undefined) this.bedMix = m.bedMix
      if (m.grainMix !== undefined) this.grainMix = m.grainMix
      if (m.patchDepth !== undefined) this.patchDepth = m.patchDepth
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
    // lesson as round 8's BRIGHTNESS_RAMP. Range narrowed to match Variant
    // 1/2's proven 1200-5000Hz (was 1800-7000) — round 8's actual lesson was
    // about a *wide, fast* resonant sweep, not resonance itself.
    const kBlockBright = 1 - Math.exp(-(n / this.fs) / 0.15)
    const bedCutTarget = (1200 + 3300 * this.speedNorm(this.speed)) * this.hardBright
    this.bedCut += kBlockBright * (bedCutTarget - this.bedCut)
    // Resonant bandpass coefficients (RBJ cookbook, constant 0dB peak gain:
    // b0=alpha, b1=0, b2=-alpha), recomputed at block rate from the smoothed
    // center frequency — same cadence as the old per-block kBed. Q rises
    // with pressure like Variant 1/2's bandpassQ ("harder press → narrower/
    // more resonant → denser scratch").
    {
      const w0 = 2 * Math.PI * Math.min(this.bedCut, this.fs * 0.45) / this.fs
      const bedQ = 0.8 + Math.max(0, this.pressure) * 1.0
      const alpha = Math.sin(w0) / (2 * bedQ)
      const cosw0 = Math.cos(w0)
      const a0 = 1 + alpha
      this.bedB0 = alpha / a0
      this.bedA1 = (-2 * cosw0) / a0
      this.bedA2 = (1 - alpha) / a0
    }
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

      // ── bed: decorrelated L/R resonant bandpass over white noise, slow
      //    patchiness (direct-form-II-transposed biquad; b1=0/b2=-b0 per
      //    the block-rate coefficients computed above) ──
      const nL = this.rnd() * 2 - 1
      const nR = this.rnd() * 2 - 1
      const bedRawL = this.bedB0 * nL + this.bedZ1L
      this.bedZ1L = -this.bedA1 * bedRawL + this.bedZ2L
      this.bedZ2L = -this.bedB0 * nL - this.bedA2 * bedRawL
      const bedRawR = this.bedB0 * nR + this.bedZ1R
      this.bedZ1R = -this.bedA1 * bedRawR + this.bedZ2R
      this.bedZ2R = -this.bedB0 * nR - this.bedA2 * bedRawR
      let bedL = bedRawL
      let bedR = bedRawR
      if (--this.patchCountdown <= 0) {
        // sample-and-hold + glide: modulation depth is exact by construction
        // (no lowpassed-noise amplitude surprises — the round-2/3 bug class);
        // exponential shape so "more tooth" patches swing further up than
        // "less tooth" ones swing down (range ≈ 0.55-1.8×)
        this.patchTarget = Math.exp(this.patchDepth * (this.rnd() * 2 - 1))
        this.patchCountdown = Math.round((0.03 + 0.1 * this.rnd()) * this.fs)
      }
      this.patch += this.kPatch * (this.patchTarget - this.patch)
      bedL *= this.patch
      bedR *= this.patch

      // ── transients (own gain path — master gain is ~0 at touchdown/lift,
      //    exactly the moment these need to be heard, so both bypass it —
      //    see tapImpulsePending's field comment for why the click needs
      //    its own resonator rather than riding the modal bank below). ──
      const tapKick = this.tapImpulsePending
      this.tapImpulsePending = 0
      const tapY = this.tapRingIn * tapKick + this.tapRingA1 * this.tapRingY1 + this.tapRingA2 * this.tapRingY2
      this.tapRingY2 = this.tapRingY1; this.tapRingY1 = tapY
      const lift = gNoise * this.liftEnv
      this.liftEnv *= this.liftDecay
      // Round 15: tap's own output multiplier bumped 4 -> 4.8 (Ilya: "стук
      // ... чуть громче") — isolated from `lift`, which shares
      // `transientMix` below but not this factor, so lift's loudness is
      // unaffected.
      const transient = (tapY * 4.8 + lift) * this.transientMix

      // ── modal resonator bank: grains (and a touch of the tap kick, for
      //    body/continuity while an active stroke is already ringing it)
      //    ping it — gated by `gain`, unlike the click above ──
      const feedL = exGL + bedL * 0.12 + tapKick * 0.3
      const feedR = exGR + bedR * 0.12 + tapKick * 0.3
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

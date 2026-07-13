// Offline measurements of the Variant 3 DSP core (#153) — the same class the
// AudioWorklet executes (see index.ts), driven here directly at 48 kHz with
// a simulated 120 Hz pointer stream. Assertion ranges are deliberately loose:
// they pin the *structure* (silence when idle, sound when moving, texture/
// brightness in the right ballpark, stereo decorrelation, transients) rather
// than exact numbers, so retuning mix constants doesn't break the suite.
// Reference targets from real recordings (PENCIL_SOUND_TUNING_LOG.md round
// 3): spectral centroid ≈ 5.7-6.7 kHz, envelope crest ≈ 11, macro RMS CV
// (50 ms) ≈ 0.75.

import { describe, expect, it } from 'vitest'

import { Variant3Synth } from './Variant3Synth'

const FS = 48000
const BLOCK = 128
const UPDATE_INTERVAL_MS = 1000 / 120

interface Drive {
  speed: number
  pressure: number
}

/** Renders `seconds` of audio, posting an 'update' every ~8ms while `drive`
 *  returns a value; `drive(tMs)` returning null = no more pointer events
 *  (stylus still / lifted without a stop message). */
function renderSession(
  synth: Variant3Synth,
  seconds: number,
  drive: (tMs: number) => Drive | null,
): { L: Float32Array; R: Float32Array } {
  const total = Math.round(seconds * FS)
  const L = new Float32Array(total)
  const R = new Float32Array(total)
  const bl = new Float32Array(BLOCK)
  const br = new Float32Array(BLOCK)
  let nextUpdateMs = 0
  for (let off = 0; off < total; off += BLOCK) {
    const tMs = (off / FS) * 1000
    if (tMs >= nextUpdateMs) {
      const d = drive(tMs)
      if (d) synth.handleMessage({ type: 'update', speed: d.speed, pressure: d.pressure, tiltNorm: 0 })
      nextUpdateMs = tMs + UPDATE_INTERVAL_MS
    }
    synth.render(bl, br)
    const n = Math.min(BLOCK, total - off)
    L.set(bl.subarray(0, n), off)
    R.set(br.subarray(0, n), off)
  }
  return { L, R }
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0
  for (let i = from; i < to; i++) s += x[i] * x[i]
  return Math.sqrt(s / Math.max(1, to - from))
}

/** Coefficient of variation of 50ms-window RMS — round 3's "macro CV". */
function macroCV(x: Float32Array): number {
  const win = Math.round(0.05 * FS)
  const vals: number[] = []
  for (let off = 0; off + win <= x.length; off += win) vals.push(rms(x, off, off + win))
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const varSum = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length
  return Math.sqrt(varSum) / mean
}

/** Envelope crest factor: peak/RMS of |x| smoothed with a 2ms one-pole —
 *  a cheap stand-in for round 3's Hilbert-envelope crest. */
function envelopeCrest(x: Float32Array): number {
  const k = 1 - Math.exp(-1 / (0.002 * FS))
  let env = 0
  let peak = 0
  let sumSq = 0
  for (let i = 0; i < x.length; i++) {
    env += k * (Math.abs(x[i]) - env)
    if (env > peak) peak = env
    sumSq += env * env
  }
  return peak / Math.sqrt(sumSq / x.length)
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cwr = 1
      let cwi = 0
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j]
        const ui = im[i + j]
        const vr = re[i + j + len / 2] * cwr - im[i + j + len / 2] * cwi
        const vi = re[i + j + len / 2] * cwi + im[i + j + len / 2] * cwr
        re[i + j] = ur + vr; im[i + j] = ui + vi
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi
        const nwr = cwr * wr - cwi * wi
        cwi = cwr * wi + cwi * wr
        cwr = nwr
      }
    }
  }
}

/** Average spectral centroid (Hz) over Hann-windowed 8192-sample frames. */
function spectralCentroid(x: Float32Array): number {
  const N = 8192
  let num = 0
  let den = 0
  for (let off = 0; off + N <= x.length; off += N) {
    const re = new Float64Array(N)
    const im = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      re[i] = x[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
    }
    fft(re, im)
    for (let k = 1; k < N / 2; k++) {
      const mag = Math.hypot(re[k], im[k])
      num += ((k * FS) / N) * mag
      den += mag
    }
  }
  return num / den
}

function correlation(a: Float32Array, b: Float32Array): number {
  let sa = 0, sb = 0, sab = 0
  for (let i = 0; i < a.length; i++) { sa += a[i] * a[i]; sb += b[i] * b[i]; sab += a[i] * b[i] }
  return sab / Math.sqrt(sa * sb || 1)
}

function makeSynth(): Variant3Synth {
  const synth = new Variant3Synth(FS)
  synth.handleMessage({ type: 'config', hardness: 0.38, paper: 'rough' })
  return synth
}

describe('Variant3Synth (offline, 48kHz)', () => {
  it('is silent before any stroke', () => {
    const synth = makeSynth()
    const { L } = renderSession(synth, 0.2, () => null)
    expect(rms(L)).toBeLessThan(1e-4)
  })

  it('steady stroke: level, texture, brightness and stereo in the target ballpark', () => {
    const synth = makeSynth()
    synth.handleMessage({ type: 'start', pressure: 0.6, tiltNorm: 0 })
    const { L, R } = renderSession(synth, 2.0, () => ({ speed: 3, pressure: 0.6 }))
    // skip the first 300ms (touchdown tap + gain ramp) for steady-state stats
    const skip = Math.round(0.3 * FS)
    const steady = L.subarray(skip)
    const level = rms(steady)
    const cv = macroCV(steady)
    const crest = envelopeCrest(steady)
    const centroid = spectralCentroid(steady)
    const corr = correlation(L.subarray(skip), R.subarray(skip))
    // eslint-disable-next-line no-console
    console.log(`steady@3px/ms: rms=${level.toFixed(4)} macroCV=${cv.toFixed(3)} crest=${crest.toFixed(2)} centroid=${Math.round(centroid)}Hz corrLR=${corr.toFixed(3)}`)
    expect(level).toBeGreaterThan(0.01)
    expect(level).toBeLessThan(0.3)
    expect(cv).toBeGreaterThan(0.12)      // real ≈ 0.75; deliberately gentler (round 6 lesson)
    expect(cv).toBeLessThan(1.2)
    expect(crest).toBeGreaterThan(2)      // real ≈ 11
    expect(crest).toBeLessThan(30)
    expect(centroid).toBeGreaterThan(3000) // real ≈ 5700-6700
    expect(centroid).toBeLessThan(9000)
    expect(corr).toBeLessThan(0.98)       // genuinely stereo
    expect(rms(R.subarray(skip))).toBeGreaterThan(0.01)
  })

  it('slow strokes are quieter and darker than fast ones', () => {
    const slowSynth = makeSynth()
    slowSynth.handleMessage({ type: 'start', pressure: 0.6, tiltNorm: 0 })
    const slow = renderSession(slowSynth, 1.5, () => ({ speed: 0.6, pressure: 0.6 })).L.subarray(Math.round(0.3 * FS))
    const fastSynth = makeSynth()
    fastSynth.handleMessage({ type: 'start', pressure: 0.6, tiltNorm: 0 })
    const fast = renderSession(fastSynth, 1.5, () => ({ speed: 5, pressure: 0.6 })).L.subarray(Math.round(0.3 * FS))
    expect(rms(slow)).toBeGreaterThan(1e-3) // audible, just quieter
    expect(rms(slow)).toBeLessThan(rms(fast))
    expect(spectralCentroid(slow)).toBeLessThan(spectralCentroid(fast))
  })

  it('stop fades out (with a brief lift flick, then silence)', () => {
    const synth = makeSynth()
    synth.handleMessage({ type: 'start', pressure: 0.6, tiltNorm: 0 })
    renderSession(synth, 0.5, () => ({ speed: 3, pressure: 0.6 }))
    synth.handleMessage({ type: 'stop' })
    const { L } = renderSession(synth, 0.5, () => null)
    const tail = rms(L, Math.round(0.3 * FS))
    expect(tail).toBeLessThan(1e-3)
  })

  it('watchdog: no pointer events (stylus held still) → decays to silence without a stop', () => {
    const synth = makeSynth()
    synth.handleMessage({ type: 'start', pressure: 0.6, tiltNorm: 0 })
    renderSession(synth, 0.3, () => ({ speed: 3, pressure: 0.6 }))
    // stylus freezes mid-stroke: no updates at all, no stop message
    const { L } = renderSession(synth, 0.6, () => null)
    const tail = rms(L, Math.round(0.4 * FS))
    expect(tail).toBeLessThan(1e-3)
  })

  it('touchdown tap is audible even when the stroke starts from standstill', () => {
    const synth = makeSynth()
    synth.handleMessage({ type: 'start', pressure: 0.7, tiltNorm: 0 })
    const { L } = renderSession(synth, 0.5, () => ({ speed: 0, pressure: 0.7 }))
    const head = rms(L, 0, Math.round(0.05 * FS))
    const late = rms(L, Math.round(0.3 * FS))
    expect(head).toBeGreaterThan(5 * Math.max(late, 1e-6))
    expect(head).toBeGreaterThan(0.003)
  })
})

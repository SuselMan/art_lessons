// Main-thread wrapper for pencil sound "Variant 3" (#153). Same public
// surface as lib/PencilSound.ts's PencilSound (start/update/stop/destroy/
// setHardness, driven by the engine's strokeStart/pointer/strokeEnd events —
// see Room/index.tsx), but the synthesis itself runs per-sample inside an
// AudioWorklet: see Variant3Synth.ts for the DSP and why.
//
// The worklet module is built at runtime by serializing the Variant3Synth
// class with .toString() into a Blob URL. That's deliberate: it keeps one
// source of truth that both the worklet and the offline vitest measurements
// (Variant3Synth.test.ts) execute, and it sidesteps bundler-specific worklet
// asset plumbing entirely (Vite has first-class handling for `new Worker()`
// but not for audioWorklet.addModule()). The cost is the constraint
// documented in Variant3Synth.ts: the class must stay self-contained. The
// `const Variant3SynthClass = <class expr>` alias below is what keeps this
// working under minification — the production build may rename the class,
// but the serialized expression is bound to our own stable name.

import type { PaperType } from '@art-lessons/shared'

import type { PencilSoundAPI } from '../PencilSound'
import { Variant3Synth, type V3Message } from './Variant3Synth'

const TILT_MAX_DEG = 70 // same convention as PencilSound.ts

function tiltNorm(tiltX: number, tiltY: number): number {
  return Math.min(1, Math.hypot(tiltX, tiltY) / TILT_MAX_DEG)
}

let workletUrl: string | null = null

function getWorkletUrl(): string {
  if (workletUrl) return workletUrl
  const code = [
    `const Variant3SynthClass = ${Variant3Synth.toString()};`,
    // AudioWorkletProcessor/registerProcessor/sampleRate are globals inside
    // the AudioWorkletGlobalScope — they only look undefined from here.
    `class PencilSoundV3Processor extends AudioWorkletProcessor {
      constructor() {
        super()
        this._synth = new Variant3SynthClass(sampleRate)
        this.port.onmessage = (e) => this._synth.handleMessage(e.data)
      }
      process(_inputs, outputs) {
        const out = outputs[0]
        this._synth.render(out[0], out[1] || out[0])
        return true
      }
    }`,
    `registerProcessor('pencil-sound-v3', PencilSoundV3Processor)`,
  ].join('\n')
  workletUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
  return workletUrl
}

export class PencilSoundV3 implements PencilSoundAPI {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  // Messages sent before addModule() resolves (it's async; the first
  // strokeStart's start/update land in that window) — flushed on node
  // creation. 'update' entries collapse to the latest one so a long async
  // gap can't build an unbounded backlog.
  private queued: V3Message[] = []
  private hardness = 0.38 // HB — overwritten by setHardness before the first real stroke
  private paper: PaperType
  private destroyed = false

  constructor(paper: PaperType) {
    this.paper = paper
  }

  /** Call whenever the active pencil grade changes (PENCIL_PRESETS[grade].hardness). */
  setHardness(hardness: number): void {
    this.hardness = hardness
    this.post({ type: 'config', hardness, paper: this.paper })
  }

  /** Call on strokeStart. Must be reached from a real user gesture the first
   *  time (pointerdown qualifies) — that's what lets resume() unlock audio. */
  start(pressure: number, speed: number, tiltX = 0, tiltY = 0): void {
    this.ensureGraph()
    void this.ctx?.resume()
    this.post({ type: 'start', pressure, tiltNorm: tiltNorm(tiltX, tiltY) })
    this.post({ type: 'update', speed, pressure, tiltNorm: tiltNorm(tiltX, tiltY) })
  }

  /** Call on every 'pointer' event while a stroke is active. No idle timer
   *  here (unlike PencilSound) — the worklet runs its own sample-accurate
   *  watchdog, see Variant3Synth.render(). */
  update(pressure: number, speed: number, tiltX = 0, tiltY = 0): void {
    this.post({ type: 'update', speed, pressure, tiltNorm: tiltNorm(tiltX, tiltY) })
  }

  /** Call on strokeEnd — the worklet fades out and plays the lift-off flick;
   *  the graph stays alive so the next stroke has no re-construction cost. */
  stop(): void {
    this.post({ type: 'stop' })
  }

  /** Round-12 tuning panel only (PENCIL_SOUND_TUNING_LOG.md) — live A/B/C/D
   *  mix overrides while a stroke is (or gets) drawn, no graph rebuild. */
  tune(params: { bedMix?: number; grainMix?: number; patchDepth?: number }): void {
    this.post({ type: 'tune', ...params })
  }

  /** Tears everything down — call on unmount, not on strokeEnd. */
  destroy(): void {
    this.destroyed = true
    void this.ctx?.close()
    this.ctx = null
    this.node = null
    this.queued = []
  }

  private post(m: V3Message): void {
    if (this.destroyed) return
    if (this.node) {
      this.node.port.postMessage(m)
      return
    }
    const last = this.queued[this.queued.length - 1]
    if (m.type === 'update' && last?.type === 'update') this.queued[this.queued.length - 1] = m
    else this.queued.push(m)
  }

  private ensureGraph(): void {
    if (this.ctx) return
    const ctx = new AudioContext()
    this.ctx = ctx
    void ctx.audioWorklet.addModule(getWorkletUrl()).then(() => {
      if (this.destroyed) return
      const node = new AudioWorkletNode(ctx, 'pencil-sound-v3', {
        numberOfInputs: 0,
        outputChannelCount: [2],
      })
      node.connect(ctx.destination)
      this.node = node
      node.port.postMessage({ type: 'config', hardness: this.hardness, paper: this.paper } satisfies V3Message)
      for (const m of this.queued) node.port.postMessage(m)
      this.queued = []
    })
  }
}

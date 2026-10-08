import type { Operation, StrokeOperation } from '@grafetto/shared'
import { PointerInput } from '../input/PointerInput'
import type { WatercolorGestureSettings } from '../input/CanonicalWatercolorGesture'
import { getPaperBytes } from '../paper/paperLoader'
import { CanonicalWatercolorWebGpu } from './backend'
import { CanonicalBoundedSceneRunner } from './boundedSceneRunner'
import { CanonicalPaperPresentation } from './paperPresentation'
import { CanonicalWetOverlayTexture } from './wetOverlay'
import { withTransientGpuBuffers } from './transientBuffers'

export type CanonicalSceneSettings = WatercolorGestureSettings
export interface CanonicalSceneCallbacks {
 onStatus(message: string): void
 onOperation(operation: Operation): void
}

/** Standalone QA owner. It does not implement Room or admit overlapping jobs. */
export class CanonicalSceneSession {
 readonly runner: CanonicalBoundedSceneRunner
 readonly backend: CanonicalWatercolorWebGpu
 private readonly callbacks: CanonicalSceneCallbacks
 private readonly paper: CanonicalPaperPresentation
 private readonly wet: CanonicalWetOverlayTexture
 private detach: (() => void) | null = null
 private disposed = false
 private presenting = false
 private frame = 0
 private accepted = false
 private failed = false
 private readonly gpuError = (event: GPUUncapturedErrorEvent) => { if (!this.disposed) this.fail(event.error.message) }
 constructor(backend: CanonicalWatercolorWebGpu, callbacks: CanonicalSceneCallbacks) {
  this.backend = backend; this.callbacks = callbacks
  backend.device.addEventListener('uncapturederror', this.gpuError)
  void backend.device.lost.then(info => { if (!this.disposed) this.fail(`WebGPU device lost: ${info.reason} ${info.message}`) })
  this.runner = new CanonicalBoundedSceneRunner(backend, {
   progressiveSettle: true,
   now: () => performance.now(), timestamp: () => Date.now(), operationId: () => crypto.randomUUID(),
   onLocalOperation: callbacks.onOperation,
   sourceOptions: { diagnosticWaterPolicy: 'bottomless', diagnosticSharedFluid: true, diagnosticLandingReservoir: true, diagnosticLandingPolicy: 'fluid', diagnosticCanonicalSettleRadius: true, diagnosticSolventField: true, diagnosticPigmentRecord: true },
  })
  this.paper = new CanonicalPaperPresentation(backend); this.wet = new CanonicalWetOverlayTexture(backend)
 }
 get isIdle() { return !this.failed && this.runner.isIdle }
 private fail(error: unknown) { this.failed = true; this.accepted = false; this.callbacks.onStatus(String(error)) }
 attach(getSettings: () => CanonicalSceneSettings) {
  this.detach?.()
  const canvas = this.backend.options.canvas, input = new PointerInput(canvas)
  input.setTransform((x, y) => { const box = canvas.getBoundingClientRect(); return { x: (x - box.left) / box.width * 1024, y: (y - box.top) / box.height * 1024 } })
  input.on('start', event => {
   if (!this.isIdle) { this.callbacks.onStatus(this.failed ? 'Очисти холст после ошибки.' : 'Предыдущий штрих ещё рассчитывается.'); return }
   try {
    this.runner.begin(event, getSettings(), { strokeId: crypto.randomUUID(), washId: 'native-scene-wash', layerId: 'native-scene-layer', userId: 'native-scene-qa' })
    this.accepted = true; this.callbacks.onStatus('Рисование')
   } catch (error) { this.fail(error) }
  }).on('move', event => { if (this.accepted) { try { this.runner.move(event) } catch (error) { this.fail(error) } } })
   .on('end', event => {
    if (!this.accepted) return
    this.accepted = false
    try {
     this.runner.end(event); this.callbacks.onStatus('Расчёт осадка…')
     void this.runner.drain().then(() => { if (!this.disposed) this.callbacks.onStatus('Можно рисовать') }, error => this.fail(error))
    } catch (error) { this.fail(error) }
   })
  this.detach = () => input.destroy()
  const draw = () => {
   if (this.disposed) return
   if (!this.presenting && !this.failed) {
    this.presenting = true
    try {
     const encoder = this.backend.device.createCommandEncoder({ label: 'bounded scene screen' })
     const scope = this.backend.encodeOwnerCommands(encoder, () => withTransientGpuBuffers(retain => {
      const overlay = this.wet.encode(encoder, [this.runner.paperWet], performance.now())
      const buffers = overlay.buffers.map(retain)
      buffers.push(...this.paper.encode(encoder, this.runner.target, { paperColor: [1, 1, 1], wet: overlay.wet }).map(retain))
      return buffers
     }))
     try { this.backend.device.queue.submit([encoder.finish()]) } catch (error) { scope.release(); scope.value.forEach(buffer => buffer.destroy()); throw error }
     const release = () => { scope.release(); scope.value.forEach(buffer => buffer.destroy()); this.presenting = false }
     void this.backend.device.queue.onSubmittedWorkDone().then(release, error => { release(); if (!this.disposed) this.fail(error) })
    } catch (error) { this.presenting = false; this.fail(error) }
   }
   this.frame = requestAnimationFrame(draw)
  }
  cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(draw)
 }
 async replay(operations: readonly StrokeOperation[]) {
  if (!this.isIdle) throw new Error('Finish the gesture before replay')
  await this.runner.clear()
  for (const operation of operations) { this.runner.replay(operation); await this.runner.drain() }
 }
 destroy() {
  if (this.disposed) return
  this.disposed = true; cancelAnimationFrame(this.frame); this.detach?.(); this.detach = null
  this.backend.device.removeEventListener('uncapturederror', this.gpuError)
  // Reset/unmount discards the entire debug device, including an active input;
  // it never fabricates a pen-up or writes an operation on behalf of the user.
  if (this.runner.isIdle) this.runner.destroy()
  this.wet.destroy(); this.backend.destroy()
 }
}

export async function createCanonicalSceneSession(canvas: HTMLCanvasElement, callbacks: CanonicalSceneCallbacks) {
 const la = await getPaperBytes('fine'), resolution = Math.sqrt(la.length / 2)
 const bytes = new Uint8Array(resolution * resolution * 4)
 for (let k = 0; k < la.length / 2; k++) bytes.set([la[k * 2], la[k * 2], la[k * 2], la[k * 2 + 1]], k * 4)
 const backend = await CanonicalWatercolorWebGpu.create({ canvas, width: 1024, height: 1024, paper: { bytes, width: resolution, height: resolution, origin: [0, 0], texSize: [1024, 1024], scale: 1 } })
 try { return new CanonicalSceneSession(backend, callbacks) } catch (error) { backend.destroy(); throw error }
}

import { saveBrushGlState } from './BrushGlState'
import type { BrushMipCache } from './BrushMipCache'
import type { BrushTextureCache } from './BrushTextureCache'

export interface BrushGlBatchResource { readonly key: string; readonly bytes: number }
export interface BrushGlBatchLifetime { readonly owner: object; readonly lease: () => () => void }
export interface BrushGlBatchInfo {
  readonly gl: WebGLRenderingContext
  readonly cache: BrushTextureCache
  readonly cpu: BrushMipCache
  readonly epoch: object
  readonly attributes: readonly number[]
  readonly instancing: ANGLE_instanced_arrays | null
  readonly vertexArrays: OES_vertex_array_object | null
  readonly resources: readonly BrushGlBatchResource[]
}
/** Internal services expose metadata, never a raw draw bypass. */
export interface BrushGlBatchParticipant {
  brushGlBatchInfo(): BrushGlBatchInfo
  enterBrushGlBatch(frame: BrushGlBatchFrame): () => void
}
interface Target { readonly texture: WebGLTexture; readonly framebuffer: WebGLFramebuffer; readonly width: number; readonly height: number; readonly originX: number; readonly originY: number }
const noop = () => {}
const authority = Symbol('brush-gl-batch')

/** Explicit synchronous scope. No ambient current frame or cross-frame GL cache.
 * Callers must not issue arbitrary GL, mutate owners, prepare/reset services or
 * yield while inside the callback. Only prepared, declared resources may be used. */
export class BrushGlBatchFrame {
  private readonly infos: Map<BrushGlBatchParticipant, BrushGlBatchInfo>
  private readonly owners: Set<BrushGlBatchLifetime>
  private readonly resources: Map<string, number>
  private readonly samplers = new Map<WebGLTexture, readonly number[]>()
  private readonly targets = new Map<WebGLFramebuffer, Target>()
  private readonly groups: (() => void)[] = []
  private opened = false
  private acquiring = true
  private draws = 0
  private groupCount = 0
  private pendingGroup?: symbol
  private started = 0
  private readonly gl: WebGLRenderingContext
  private readonly cache: BrushTextureCache
  constructor(key: symbol, infos: Map<BrushGlBatchParticipant, BrushGlBatchInfo>, owners: readonly BrushGlBatchLifetime[], resources: Map<string, number>) {
    if (key !== authority) throw new Error('Brush GL batch frames require coordinator ownership')
    this.infos = infos; this.owners = new Set(owners); this.resources = resources
    const first = infos.values().next().value!
    this.gl = first.gl; this.cache = first.cache
  }
  /** @internal participant admission is valid only during coordinator acquisition. */
  acceptParticipant(participant: BrushGlBatchParticipant): void {
    if (!this.acquiring || !this.infos.has(participant)) throw new Error('Closed or foreign brush GL batch acquisition')
  }
  /** @internal coordinator only */
  open(key: symbol): void { if (key !== authority) throw new Error('Invalid batch authority'); this.acquiring = false; this.opened = true; this.started = performance.now() }
  get shouldYield(): boolean { return this.draws >= 8 || this.draws > 0 && performance.now() - this.started >= 4 }
  assert(participant: BrushGlBatchParticipant, resources: readonly BrushGlBatchResource[], owners: readonly BrushGlBatchLifetime[] = []): void {
    const saved = this.infos.get(participant)
    if (!this.opened || !saved) throw new Error('Closed or foreign brush GL batch')
    const current = participant.brushGlBatchInfo()
    if (current.epoch !== saved.epoch || current.gl !== this.gl || current.cache !== this.cache) throw new Error('Brush GL batch service epoch changed')
    for (const item of resources) if (this.resources.get(item.key) !== item.bytes || this.cache.resourceBytes(item.key) !== item.bytes || !this.cache.get(item.key)) throw new Error('Undeclared or changed batch resource')
    for (const owner of owners) if (!this.owners.has(owner)) throw new Error('Undeclared batch owner')
  }
  beforeWork(): void {
    if (!this.opened) throw new Error('Closed brush GL batch')
    if (this.gl.isContextLost()) throw new Error('Brush GL batch context lost')
    if (this.shouldYield) throw new Error('Brush GL batch budget exhausted; yield outside the frame')
  }
  beginGroup(): symbol {
    this.beforeWork()
    if (this.groupCount >= 8) throw new Error('Brush GL batch group budget exhausted')
    this.groupCount++
    const token = Symbol('brush-batch-group')
    this.pendingGroup = token
    return token
  }
  endGroup(token: symbol): void { if (this.pendingGroup === token) this.pendingGroup = undefined }
  beginDraw(): void {
    // The first draw paired with an already-admitted prepass group must finish
    // its command even if mask preparation crossed the soft 4ms boundary.
    if (this.pendingGroup && this.opened && !this.gl.isContextLost() && this.draws < 8) this.pendingGroup = undefined
    else this.beforeWork()
    this.draws++
  }
  holdGroup(release: () => void): void { if (!this.opened) throw new Error('Closed brush GL batch'); this.groups.push(release) }
  pointSampling(texture: WebGLTexture): () => void {
    if (!this.opened) throw new Error('Closed brush GL batch')
    if (this.samplers.has(texture)) return noop
    const gl = this.gl, names = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]
    this.samplers.set(texture, names.map(name => gl.getTexParameter(gl.TEXTURE_2D, name) as number))
    for (const [i, value] of [gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE].entries()) gl.texParameteri(gl.TEXTURE_2D, names[i], value)
    return noop
  }
  bindTarget(target: Target): void {
    if (!this.opened) throw new Error('Closed brush GL batch')
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    const previous = this.targets.get(target.framebuffer)
    if (previous) {
      if (previous.texture !== target.texture || previous.width !== target.width || previous.height !== target.height || previous.originX !== target.originX || previous.originY !== target.originY) throw new Error('Batch framebuffer attachment identity changed')
      return
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE || gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) !== target.texture) throw new Error('Canonical target attachment does not match its declared texture')
    this.targets.set(target.framebuffer, { ...target })
  }
  /** @internal coordinator only; owners remain leased until after state restore. */
  close(key: symbol): void {
    if (key !== authority) throw new Error('Invalid batch authority')
    this.opened = false
    this.acquiring = false
    let failed = false, failure: unknown
    for (const release of this.groups.reverse()) try { release() } catch (error) { if (!failed) { failed = true; failure = error } }
    if (!this.gl.isContextLost()) {
      const gl = this.gl, names = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]
      gl.activeTexture(gl.TEXTURE0)
      for (const [texture, values] of this.samplers) {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        for (let i = 0; i < names.length; i++) gl.texParameteri(gl.TEXTURE_2D, names[i], values[i])
      }
    }
    if (failed) throw failure
  }
}

export function runBrushGlBatch(options: {
  readonly participants: readonly BrushGlBatchParticipant[]
  readonly owners?: readonly BrushGlBatchLifetime[]
  readonly resources?: readonly BrushGlBatchResource[]
}, execute: (frame: BrushGlBatchFrame) => void): void {
  if (!options.participants.length || options.participants.length > 8) throw new RangeError('Invalid brush GL batch participants')
  const infos = new Map(options.participants.map(p => [p, p.brushGlBatchInfo()])), first = infos.values().next().value!
  if (first.gl.isContextLost()) throw new Error('Brush GL batch context lost')
  const resources = new Map<string, number>(), owners = [...new Set(options.owners ?? [])]
  if (owners.length > 64 || (options.resources?.length ?? 0) > 1024) throw new RangeError('Brush GL batch declarations exceed capacity')
  for (const info of infos.values()) if (info.gl !== first.gl || info.cache !== first.cache || info.cpu !== first.cpu || info.instancing !== first.instancing || info.vertexArrays !== first.vertexArrays) throw new Error('Brush GL batch context/cache mismatch')
  for (const item of [...[...infos.values()].flatMap(info => info.resources), ...options.resources ?? []]) {
    if (!item.key || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || first.cache.resourceBytes(item.key) !== item.bytes || !first.cache.get(item.key) || resources.has(item.key) && resources.get(item.key) !== item.bytes) throw new RangeError('Unprepared batch resource')
    resources.set(item.key, item.bytes)
  }
  if (resources.size > 1024 || [...resources.values()].reduce((a, b) => a + b, 0) > first.cache.budgetBytes) throw new RangeError('Brush GL batch GPU budget exceeded')
  for (const owner of owners) if (!owner || !owner.owner || typeof owner.owner !== 'object' || typeof owner.lease !== 'function') throw new RangeError('Invalid batch owner lifetime')
  const cpuBytes = 4096 + resources.size * 96 + owners.length * 128 + infos.size * 256
  const releaseCpu = first.cpu.reserve(cpuBytes)
  const frame = new BrushGlBatchFrame(authority, infos, owners, resources), releases: (() => void)[] = []
  let restore: (() => void) | undefined, failed = false, failure: unknown
  const cleanup = (fn: () => void) => { try { fn() } catch (error) { if (!failed) { failed = true; failure = error } } }
  try {
    for (const participant of infos.keys()) releases.push(participant.enterBrushGlBatch(frame))
    first.cache.protect([...resources.keys()])
    releases.push(first.cache.lease([...resources].map(([key, bytes]) => ({ key, bytes }))))
    const attributes = [...new Set([...infos.values()].flatMap(info => [...info.attributes]))]
    restore = saveBrushGlState(first.gl, attributes, first.instancing, first.vertexArrays, 3)
    for (const owner of owners) {
      const release = owner.lease()
      if (typeof release !== 'function') throw new Error('Invalid batch owner release')
      releases.push(release)
    }
    // Owner callbacks may touch GL: capture precedes them, including failure paths.
    for (const [participant, info] of infos) if (participant.brushGlBatchInfo().epoch !== info.epoch) throw new Error('Brush GL batch service changed during acquisition')
    frame.open(authority)
    const value: unknown = execute(frame)
    if (value && typeof (value as { then?: unknown }).then === 'function') throw new Error('Brush GL batch callback must be synchronous')
  } catch (error) { failed = true; failure = error }
  finally {
    cleanup(() => frame.close(authority))
    if (restore && !first.gl.isContextLost()) cleanup(restore)
    for (const release of releases.reverse()) cleanup(release)
    cleanup(releaseCpu)
  }
  if (failed) throw failure
}

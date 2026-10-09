/** Prototype canonical execution: input owns immutable requests; this queue
 * executes their GPU continuations only after the previous solver has landed.
 * It never drains a blocked solver on the input stack. */
export interface CanonicalWatercolorRequest {
  /** Native tasks keep the same FIFO; the engine selects their GPU clock. */
  gpuBackend?: 'webgpu'
  execute(): Generator<number, void, void>
  cancel(contextLost: boolean): void
}
export interface CanonicalWatercolorFIFOContext {
  advance?(work: Generator<number, void, void>, current: () => boolean, request?: CanonicalWatercolorRequest, capability?: object): IteratorResult<number, void>
  blocked(): boolean
  schedule(callback: () => void): number
  unschedule(handle: number): void
  changed(): void
  failed(error: unknown): void
}
export class WatercolorCanonicalFIFO {
  private requests: CanonicalWatercolorRequest[] = []
  private work: Generator<number, void, void> | null = null
  private frame = 0
  private epoch = 0
  private waiters: Array<(completed: boolean) => void> = []
  private activeCapability: object | null = null
  private capabilities: WeakMap<object, { request: CanonicalWatercolorRequest; epoch: number }> | null = null
  private readonly ctx: CanonicalWatercolorFIFOContext
  private readonly diagnosticExecutionCapability: boolean
  constructor(ctx: CanonicalWatercolorFIFOContext, diagnosticExecutionCapability = false) {
    this.ctx = ctx
    this.diagnosticExecutionCapability = import.meta.env.DEV && diagnosticExecutionCapability === true
  }
  /** Diagnostic-only synchronous witness; never changes pending/ready semantics. */
  isSoleExecutingOwner(capability: object): boolean {
    const owned = this.capabilities?.get(capability)
    return this.diagnosticExecutionCapability && capability === this.activeCapability && !!owned
      && owned.epoch === this.epoch && owned.request === this.requests[0]
      && this.requests.length === 1 && !this.ctx.blocked()
  }
  /** Includes the executing request until its owned generator has completed. */
  get queuedRequestCount(): number { return this.requests.length }
  get pending(): boolean { return this.requests.length > 0 || this.ctx.blocked() }
  enqueue(request: CanonicalWatercolorRequest): void {
    this.requests.push(request)
    this.schedule()
  }
  /** Remove only this exact unstarted admission; never cancel unrelated work.
   * Used by isolated owned-request prototypes when schedule throws after push.
   * An executing head retains ownership and cannot be rolled back here. */
  cancelUnstarted(request: CanonicalWatercolorRequest, contextLost = false): boolean {
    const index = this.requests.indexOf(request)
    if (index < 0 || index === 0 && this.work !== null) return false
    this.requests.splice(index, 1)
    request.cancel(contextLost)
    if (!this.pending) {
      const waiters = this.waiters.splice(0)
      for (const resolve of waiters) resolve(true)
    }
    return true
  }
  ready(): Promise<boolean> {
    if (!this.pending) return Promise.resolve(true)
    this.schedule()
    return new Promise(resolve => this.waiters.push(resolve))
  }
  private schedule(): void {
    if (this.frame) return
    const epoch = this.epoch
    this.frame = this.ctx.schedule(() => {
      if (epoch !== this.epoch) return
      this.frame = 0
      this.advance()
    })
  }
  /** One continuation unit, never a synchronous complete-to-idle loop. */
  private advance(): void {
    if (this.activeCapability) throw Error('Reentrant canonical execution')
    if (this.ctx.blocked()) { this.schedule(); return }
    const request = this.requests[0]
    if (request) {
      const epoch = this.epoch
      try {
        this.work ??= request.execute()
        let step: IteratorResult<number, void>
        if (this.diagnosticExecutionCapability) {
          const capability = Object.freeze({})
          ;(this.capabilities ??= new WeakMap()).set(capability, { request, epoch })
          this.activeCapability = capability
          try { step = this.ctx.advance ? this.ctx.advance(this.work, () => epoch === this.epoch, request, capability) : this.work.next() }
          finally { this.activeCapability = null; this.capabilities!.delete(capability) }
        } else {
          step = this.ctx.advance ? this.ctx.advance(this.work, () => epoch === this.epoch, request) : this.work.next()
        }
        if (epoch !== this.epoch) return
        if (step.done) { this.requests.shift(); this.work = null }
        this.ctx.changed()
      } catch (error) {
        this.cancel(false)
        this.ctx.failed(error)
        return
      }
    }
    if (this.pending) this.schedule()
    else {
      const waiters = this.waiters.splice(0)
      for (const resolve of waiters) resolve(true)
    }
  }
  cancel(contextLost: boolean): void {
    this.epoch++
    if (this.frame) this.ctx.unschedule(this.frame)
    this.frame = 0
    const requests = this.requests.splice(0)
    this.work = null
    // Owners close paused generators themselves, so loss can forget textures.
    for (const request of requests) request.cancel(contextLost)
    const waiters = this.waiters.splice(0)
    for (const resolve of waiters) resolve(false)
  }
}

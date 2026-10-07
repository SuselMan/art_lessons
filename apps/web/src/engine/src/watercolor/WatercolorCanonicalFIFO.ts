/** Prototype canonical execution: input owns immutable requests; this queue
 * executes their GPU continuations only after the previous solver has landed.
 * It never drains a blocked solver on the input stack. */
export interface CanonicalWatercolorRequest {
  execute(): Generator<number, void, void>
  cancel(contextLost: boolean): void
}
export interface CanonicalWatercolorFIFOContext {
  advance?(work: Generator<number, void, void>, current: () => boolean): IteratorResult<number, void>
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
  private readonly ctx: CanonicalWatercolorFIFOContext
  constructor(ctx: CanonicalWatercolorFIFOContext) { this.ctx = ctx }
  /** Includes the executing request until its owned generator has completed. */
  get queuedRequestCount(): number { return this.requests.length }
  get pending(): boolean { return this.requests.length > 0 || this.ctx.blocked() }
  enqueue(request: CanonicalWatercolorRequest): void {
    this.requests.push(request)
    this.schedule()
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
    if (this.ctx.blocked()) { this.schedule(); return }
    const request = this.requests[0]
    if (request) {
      const epoch = this.epoch
      try {
        this.work ??= request.execute()
        const step = this.ctx.advance ? this.ctx.advance(this.work, () => epoch === this.epoch) : this.work.next()
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

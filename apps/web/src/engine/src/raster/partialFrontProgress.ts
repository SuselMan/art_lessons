/** Presentation clock only. It never advances or describes canonical paint. */
export const PARTIAL_PREVIEW_INTERVAL_MS = 150
export type PartialFrontTarget = Readonly<{ at: number; steps: number; tauMs: number }>

export class PartialFrontProgress {
  private relaxed = 0
  private completed = 0
  private publishedAt: number
  private readonly limit: number
  constructor(limit: number, capturedAt: number) {
    this.limit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0
    this.publishedAt = capturedAt
  }
  /** Existing outward front contains unit relaxations only. */
  advance(count: number): number {
    if (!Number.isInteger(count) || count <= 0) return 0
    this.relaxed += count
    return Math.min(count, Math.max(0, Math.min(this.relaxed, this.limit) - this.completed))
  }
  commit(): void { this.completed++ }
  target(now: number): PartialFrontTarget | undefined {
    if (!Number.isFinite(now) || !Number.isFinite(this.publishedAt) || now <= this.publishedAt) return undefined
    const tauMs = Math.max(PARTIAL_PREVIEW_INTERVAL_MS, Math.min(1400, now - this.publishedAt))
    this.publishedAt = now
    return Object.freeze({ at: now, steps: this.completed, tauMs })
  }
}

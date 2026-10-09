/** DEV CPU submission observations; never GPU duration or physical visibility. */
export type GlTimingRecord = Readonly<{ input: number; phase: string; start: number; end: number; value?: number }>
export class BoundedGlTiming {
  private readonly records: (GlTimingRecord | undefined)[]
  private cursor = 0
  private size = 0
  private input = 0
  private pigmentSeen = false
  private readonly clock: () => number
  constructor(clock: () => number = () => performance.now(), capacity = 256) {
    this.clock = clock
    this.records = new Array(Math.max(1, Math.min(1024, Math.floor(capacity) || 256)))
  }
  beginInput(): void { this.input++; this.pigmentSeen = false }
  begin(): number | null { try { const t = this.clock(); return Number.isFinite(t) ? t : null } catch { return null } }
  end(phase: string, start: number | null, value?: number): void {
    if (start === null) return
    try {
      const end = this.clock()
      if (!Number.isFinite(end) || end < start) return
      this.records[this.cursor] = { input: this.input, phase, start, end, value }
      this.cursor = (this.cursor + 1) % this.records.length
      this.size = Math.min(this.size + 1, this.records.length)
    } catch { /* Observation must never affect drawing or its original exception. */ }
  }
  mark(phase: string, value?: number): void { this.end(phase, this.begin(), value) }
  firstPigment(): void {
    if (this.pigmentSeen) return
    this.pigmentSeen = true
    this.mark('first-pigment-submit')
  }
  measure<T>(phase: string, work: () => T): T {
    const start = this.begin()
    try { return work() } finally { this.end(phase, start) }
  }
  export(): GlTimingRecord[] {
    const out: GlTimingRecord[] = []
    for (let i = 0; i < this.size; i++) out.push({ ...this.records[(this.cursor - this.size + i + this.records.length) % this.records.length]! })
    return out
  }
}

/** DEV CPU submission observations; never GPU duration or physical visibility. */
export type GlTimingRecord = Readonly<{ input: number; phase: string; start: number; end: number; value?: number; userId: string | null; layerId: string | null; strokeId: string | null }>
export class BoundedGlTiming {
  private readonly records: (GlTimingRecord | undefined)[]
  private cursor = 0
  private size = 0
  private input = 0
  private pigmentSeen = false
  private active = false
  private userId: string | null = null
  private layerId: string | null = null
  private strokeId: string | null = null
  private dropped = 0
  private observerErrors = 0
  private readonly clock: () => number
  constructor(clock: () => number = () => performance.now(), capacity = 1024) {
    this.clock = clock
    this.records = new Array(Math.max(1, Math.min(1024, Math.floor(capacity) || 1024)))
  }
  beginInput(userId: string | null = null, layerId: string | null = null): void {
    this.input++; this.pigmentSeen = false; this.active = true
    this.userId = userId; this.layerId = layerId; this.strokeId = null
  }
  endInput(): void { this.active = false }
  isActive(): boolean { return this.active }
  setStrokeId(id: string | null): void { if (this.active) this.strokeId = id }
  stats() { return { capacity: this.records.length, recorded: this.size, dropped: this.dropped, observerErrors: this.observerErrors, active: this.active, scope: 'engine-local synchronous DOWN only' } }

  begin(): number | null { if (!this.active) return null; try { const t = this.clock(); if (!Number.isFinite(t)) { this.observerErrors++; return null } return t } catch { this.observerErrors++; return null } }
  end(phase: string, start: number | null, value?: number): void {
    if (start === null || !this.active) return
    try {
      const end = this.clock()
      if (!Number.isFinite(end) || end < start) { this.observerErrors++; return }
      this.records[this.cursor] = { input: this.input, phase, start, end, value, userId: this.userId, layerId: this.layerId, strokeId: this.strokeId }
      if (this.size === this.records.length) this.dropped++
      this.cursor = (this.cursor + 1) % this.records.length
      this.size = Math.min(this.size + 1, this.records.length)
    } catch { this.observerErrors++; /* Observation must never affect drawing or its original exception. */ }
  }
  mark(phase: string, value?: number): void { this.end(phase, this.begin(), value) }
  firstPigment(): void {
    if (!this.active || !this.strokeId || this.pigmentSeen) return
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

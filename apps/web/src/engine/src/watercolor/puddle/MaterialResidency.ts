/** GPU residency is a cache policy, never a drying operation. CPU entries own
 * their bytes; eviction retains a logical marker for journal reconstruction. */
export class MaterialResidency<K, V extends {bytes: number}> {
  private readonly entries = new Map<K, {value?: V; pins: number}>()
  private used = 0
  readonly capacity: number
  readonly byteBudget: number
  constructor(capacity = 2, byteBudget = 64 * 1024 * 1024) {
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(byteBudget) || byteBudget < 0) throw new Error('Invalid material cache budget')
    this.capacity = capacity
    this.byteBudget = byteBudget
  }
  get bytes(): number { return this.used }
  get size(): number { return this.entries.size }
  has(key: K): boolean { return this.entries.has(key) }
  peek(key: K): V | undefined { return this.entries.get(key)?.value }
  hasBytes(key: K): boolean { return !!this.entries.get(key)?.value }
  /** A pin belongs to an executing operation, including suspended generators. */
  acquire(key: K): () => void {
    let entry = this.entries.get(key)
    if (!entry) { entry = {pins: 0}; this.entries.set(key, entry) }
    entry.pins++
    let active = true
    return () => { if (active) { active = false; entry.pins-- } }
  }
  pinned(key: K): boolean { return (this.entries.get(key)?.pins ?? 0) > 0 }
  /** Oldest unpinned resident is the only legal parking candidate. */
  victim(residents: readonly K[], requested: K): K | undefined {
    if (residents.includes(requested) || residents.length < this.capacity) return undefined
    return residents.find(key => key !== requested && !this.pinned(key))
  }
  store(key: K, value: V): void {
    if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) throw new Error('Invalid material snapshot byte count')
    const old = this.entries.get(key)
    if (old?.pins) throw new Error('Cannot park an executing material operation')
    if (old?.value) this.used -= old.value.bytes
    this.entries.delete(key)
    this.entries.set(key, {pins: 0, value})
    this.used += value.bytes
    for (const entry of this.entries.values()) {
      if (this.used <= this.byteBudget) break
      if (entry.value) { this.used -= entry.value.bytes; entry.value = undefined }
    }
  }
  /** Transfer bytes to the resident owner; a missing value requires replay. */
  take(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    const value = entry.value
    if (value) this.used -= value.bytes
    entry.value = undefined
    return value
  }
  forget(key: K): void {
    const entry = this.entries.get(key)
    if (entry?.pins) throw new Error('Cannot discard an executing material operation')
    if (entry?.value) this.used -= entry.value.bytes
    this.entries.delete(key)
  }
}

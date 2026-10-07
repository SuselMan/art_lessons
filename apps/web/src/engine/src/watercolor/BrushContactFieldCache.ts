import { brushDragContactGroups, brushDragField, type BrushTravel } from './brushDrag'

type Field = NonNullable<ReturnType<typeof brushDragField>>
type Rect = { x: number; y: number; w: number; h: number }

/** Bounded diagnostic memoization of a pure CPU field, never of solver output.
 * Keys contain the exact Float64 bits of every field input in original order.
 * Copies isolate mutable upload payloads from cache ownership. */
export class BrushContactFieldCache {
  private readonly entries = new Map<string, { field: Field; bytes: number }>()
  private bytes = 0
  private hits = 0
  private misses = 0
  private bypasses = 0
  private readonly maxBytes: number
  private readonly maxEntries: number
  constructor(maxBytes = 4 * 1024 * 1024, maxEntries = 128) {
    this.maxBytes = maxBytes; this.maxEntries = maxEntries
  }

  get stats() { return { hits: this.hits, misses: this.misses, bypasses: this.bypasses, bytes: this.bytes, entries: this.entries.size } }

  clear(): void { this.entries.clear(); this.bytes = 0 }

  contacts(travel: readonly BrushTravel[], rect: Rect, cellPx = 4) {
    return brushDragContactGroups(travel, rect).map(group => ({
      rect: group.rect, radius: group.radius, field: this.field(group.travel, group.rect, cellPx),
    }))
  }

  private field(travel: readonly BrushTravel[], rect: Rect, cellPx: number): Field {
    // Avoid turning unusually long groups into large keys or retained objects.
    if (travel.length > 64 || this.maxBytes <= 0 || this.maxEntries <= 0) {
      this.bypasses++
      return brushDragField(travel, rect, cellPx)!
    }
    const values = new Float64Array(5 + travel.length * 8)
    values.set([rect.x, rect.y, rect.w, rect.h, cellPx])
    let i = 5
    for (const d of travel) {
      values[i++] = d.x; values[i++] = d.y; values[i++] = d.radius; values[i++] = d.aspect
      values[i++] = d.angle; values[i++] = d.dx; values[i++] = d.dy; values[i++] = d.water
    }
    // Binary string is collision-free, including -0; never a rounded hash.
    let key = ''
    for (const byte of new Uint8Array(values.buffer)) key += String.fromCharCode(byte)
    const cached = this.entries.get(key)
    if (cached) {
      this.hits++
      this.entries.delete(key); this.entries.set(key, cached)
      return { width: cached.field.width, height: cached.field.height, pixels: cached.field.pixels.slice() }
    }
    this.misses++
    const field = brushDragField(travel, rect, cellPx)!
    const bytes = field.pixels.byteLength + key.length * 2 + 128
    if (bytes > this.maxBytes) { this.bypasses++; return field }
    while (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value!
      this.bytes -= this.entries.get(oldest)!.bytes
      this.entries.delete(oldest)
    }
    this.entries.set(key, { field: { width: field.width, height: field.height, pixels: field.pixels.slice() }, bytes })
    this.bytes += bytes
    return field
  }
}

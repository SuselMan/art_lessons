from pathlib import Path
p=Path('apps/web/src/engine/index.ts');s=p.read_text()
a=s.index('  *spillWork(originOf:');b=s.index('  /** A parked wash back in full-sized',a)
s=s[:a]+'''  *spillWork(originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): Generator<void, SpilledScratch | null, void> {
    if (this.diffusePending || this.pendingComposite.size) return null
    const tiles: SpilledScratch['tiles'] = []
    const owned = new Set<AccumulationBuffer>(), moved = new Set<AccumulationBuffer>()
    let bytes = 0, committed = false
    const takeBuffer = (b: AccumulationBuffer): void => { owned.delete(b) }
    const releaseBuffer = (b: AccumulationBuffer): void => { if (owned.delete(b)) this.pool.release(b) }
    const dispose = (): void => { for (const b of owned) this.pool.release(b); owned.clear() }
    try {
      for (const [tile, entry] of this._tiles) {
        if (entry.strokeInk || entry.inkBase || entry.strokeColor || entry.colorBase) return null
        const at = originOf(tile)
        if (!at) return null
        const bufs: SpilledScratch['tiles'][number]['bufs'] = {}
        const whole = (b: AccumulationBuffer): ParkedScratchBuffer => {
          moved.add(b); bytes += b.width * b.height * 4
          return { buffer: b, glX: 0, glY: 0, srcX: 0, srcY: 0, w: b.width, h: b.height, whole: true }
        }
        bufs.original = whole(entry.original)
        const parts = SPILL_TILE_BUFFERS.filter(k => k !== 'original' && entry[k])
        const bounds = this._storageBounds
        const x0 = bounds ? Math.max(0, Math.floor(bounds.minX - at.originX)) : 0
        const y0 = bounds ? Math.max(0, Math.floor(bounds.minY - at.originY)) : 0
        const x1 = bounds ? Math.min(tile.width, Math.ceil(bounds.maxX - at.originX)) : tile.width
        const y1 = bounds ? Math.min(tile.height, Math.ceil(bounds.maxY - at.originY)) : tile.height
        const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0)
        const columns = Math.max(1, Math.floor(tile.width / w)), rows = Math.max(1, Math.floor(tile.height / h))
        const capacity = columns * rows
        const atlasCount = Math.ceil(parts.length / capacity)
        // Tile-sized atlases reuse the film's released buffers. Arbitrarily
        // sized small textures were themselves 100ms allocations on Safari.
        // When packing saves no memory, move the original buffers instead.
        if (atlasCount >= parts.length) {
          for (const k of parts) bufs[k] = whole(entry[k]!)
        } else {
          let atlas: AccumulationBuffer | undefined
          for (const [i, k] of parts.entries()) {
            if (i % capacity === 0) {
              atlas = this.pool.acquire(tile.width, tile.height)
              owned.add(atlas); bytes += tile.width * tile.height * 4
            }
            const srcX = (i % capacity % columns) * w, srcY = Math.floor(i % capacity / columns) * h
            const glX = Math.min(tile.width - 1, x0), glY = Math.min(tile.height - 1, Math.max(0, tile.height - y1))
            if (x1 > x0 && y1 > y0) entry[k]!.copyRegionInto(atlas!, glX, glY, srcX, srcY, w, h)
            else {
              // A present-but-empty field must remain present after restore.
              // Empty intersects are rare, so a full clear is safe and cheap.
              clearParkedBuffer(atlas!)
            }
            bufs[k] = { buffer: atlas!, glX, glY, srcX, srcY, w, h, whole: false }
            yield
          }
        }
        tiles.push({ ...at, width: tile.width, height: tile.height, bufs })
      }
      const result = { ...this._scalars(), tiles, bytes, dispose, takeBuffer, releaseBuffer }
      // Ownership moves only on successful completion. Until now the active
      // scratch was untouched and cancellation can simply release its copies.
      for (const b of moved) owned.add(b)
      for (const entry of this._tiles.values()) for (const k of SPILL_TILE_BUFFERS) {
        const b = entry[k]
        if (b && !moved.has(b)) this.pool.release(b)
      }
      this._tiles.clear()
      committed = true
      return result
    } finally { if (!committed) dispose() }
  }

'''+s[b:]
s=s.replace('    s._applyScalars(sp, target)\n    try {','''    s._applyScalars(sp, target)
    const references = new Map<AccumulationBuffer, number>()
    for (const t of sp.tiles) for (const p of Object.values(t.bufs)) if (p) {
      references.set(p.buffer, (references.get(p.buffer) ?? 0) + 1)
    }
    try {''')
s=s.replace('''          const own = pool.acquire(t.width, t.height)
          clearParkedBuffer(own)
          p.buffer.copyRegionInto(own, 0, 0, p.glX, p.glY, p.buffer.width, p.buffer.height)
          return own''','''          if (p.whole) { sp.takeBuffer(p.buffer); return p.buffer }
          const own = pool.acquire(t.width, t.height)
          clearParkedBuffer(own)
          p.buffer.copyRegionInto(own, p.srcX, p.srcY, p.glX, p.glY, p.w, p.h)
          const left = references.get(p.buffer)! - 1
          references.set(p.buffer, left)
          // Reuse a consumed atlas for later full-sized fields rather than
          // allocating a texture while continuing the wash.
          if (left === 0) sp.releaseBuffer(p.buffer)
          return own''')
s=s.replace('interface ParkedScratchBuffer { buffer: AccumulationBuffer; glX: number; glY: number }','interface ParkedScratchBuffer { buffer: AccumulationBuffer; glX: number; glY: number; srcX: number; srcY: number; w: number; h: number; whole: boolean }')
s=s.replace('  dispose(): void\n}\n\n// ─── Engine','  dispose(): void\n  takeBuffer(buffer: AccumulationBuffer): void\n  releaseBuffer(buffer: AccumulationBuffer): void\n}\n\n// ─── Engine')
p.write_text(s)

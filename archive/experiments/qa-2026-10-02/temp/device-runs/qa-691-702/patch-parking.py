from pathlib import Path
p=Path('apps/web/src/engine/index.ts');s=p.read_text()
s=s.replace('class RibbonStrokeScratch {\n', '''type ScratchBounds = { minX: number; minY: number; maxX: number; maxY: number }

class RibbonStrokeScratch {
  // #702: every rectangle written to the non-original buffers, including
  // diffusion's halo. Undefined means an older carried state has no proof
  // of its empty exterior and must be kept whole.
  private _storageBounds: ScratchBounds | null | undefined = null

  noteStorageBounds(bounds: ScratchBounds): void {
    const old = this._storageBounds
    if (old === undefined) return
    this._storageBounds = old ? {
      minX: Math.min(old.minX, bounds.minX), minY: Math.min(old.minY, bounds.minY),
      maxX: Math.max(old.maxX, bounds.maxX), maxY: Math.max(old.maxY, bounds.maxY),
    } : { ...bounds }
  }
''')
s=s.replace("  noteFinish(ctx: NonNullable<RibbonStrokeScratch['_finish']>): void {", "  noteFinish(ctx: NonNullable<RibbonStrokeScratch['_finish']>): void {\n    this.noteStorageBounds(ctx.bounds)")
s=s.replace('      needsInk: this.needsInk, needsColor: this.needsColor,','      needsInk: this.needsInk, needsColor: this.needsColor,\n      storageBounds: this._storageBounds ? { ...this._storageBounds } : this._storageBounds,')
s=s.replace('    for (const p of snap.paints) this.paints.add(p)','    this._storageBounds = snap.storageBounds ? { ...snap.storageBounds } : snap.storageBounds\n    for (const p of snap.paints) this.paints.add(p)')
s=s.replace('interface ScratchScalars {','interface ScratchScalars {\n  storageBounds?: ScratchBounds | null')
a=s.index('  /** (#536, ADR 011 §17.68) The whole wash moved off the GPU');b=s.index('  /** (#536, §17.56) A scratch as `snap` describes it',a)
s=s[:a]+'''  /** #702: park a resting wash in compact GPU buffers. CPU readback waits
   * for the whole context's queue, even for 1x1, so it cannot be a background
   * memory operation. Keep original whole: a continuation may enter a new
   * area whose pre-wash picture must still be the same. Other buffers start
   * clear and only receive writes inside storageBounds. GPU sub-rect copies
   * preserve every byte; unpark clears the missing exterior. */
  spill(originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): SpilledScratch | null {
    const work = this.spillWork(originOf)
    let r = work.next()
    while (!r.done) r = work.next()
    return r.value
  }

  *spillWork(originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): Generator<void, SpilledScratch | null, void> {
    if (this.diffusePending || this.pendingComposite.size) return null
    const tiles: SpilledScratch['tiles'] = []
    const copies: AccumulationBuffer[] = []
    let bytes = 0, committed = false, disposed = false
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      for (const b of copies) this.pool.release(b)
    }
    try {
      for (const [tile, entry] of this._tiles) {
        if (entry.strokeInk || entry.inkBase || entry.strokeColor || entry.colorBase) return null
        const at = originOf(tile)
        if (!at) return null
        const bufs: SpilledScratch['tiles'][number]['bufs'] = {}
        for (const k of SPILL_TILE_BUFFERS) {
          const b = entry[k]
          if (!b) continue
          const bounds = k === 'original' ? null : this._storageBounds
          const x0 = bounds ? Math.max(0, Math.floor(bounds.minX - at.originX)) : 0
          const y0 = bounds ? Math.max(0, Math.floor(bounds.minY - at.originY)) : 0
          const x1 = bounds ? Math.min(b.width, Math.ceil(bounds.maxX - at.originX)) : b.width
          const y1 = bounds ? Math.min(b.height, Math.ceil(bounds.maxY - at.originY)) : b.height
          // An empty, present buffer is kept as a zero 1x1 patch: presence
          // itself matters (e.g. inkDry versus the still-wet inkLoad).
          const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0)
          const copy = this.pool.acquire(w, h)
          copies.push(copy)
          const glX = Math.min(b.width - 1, x0), glY = Math.max(0, b.height - y1)
          if (x1 > x0 && y1 > y0) b.copyRegionInto(copy, glX, glY, 0, 0, w, h)
          else copy.clear()
          bufs[k] = { buffer: copy, glX, glY }
          bytes += w * h * 4
          yield
        }
        tiles.push({ ...at, width: tile.width, height: tile.height, bufs })
      }
      const result = { ...this._scalars(), tiles, bytes, dispose }
      committed = true
      return result
    } finally {
      // Cancellation or a missing tile never transfers ownership to a cache.
      if (!committed) dispose()
    }
  }

  /** A parked wash back in full-sized, zero-padded scratch buffers. */
  static unspill(pool: RibbonScratchPool, sp: SpilledScratch, target: ILayerBuffer): RibbonStrokeScratch | null {
    const s = new RibbonStrokeScratch(pool, sp.needsInk, sp.needsColor)
    s._applyScalars(sp, target)
    try {
      for (const t of sp.tiles) {
        const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
        const tile = target.resolveForPaint(rect).find(r => r.originX === t.originX && r.originY === t.originY)?.buffer
        if (!tile) { s.destroy(); return null }
        const take = (p: ParkedScratchBuffer | undefined): AccumulationBuffer | null => {
          if (!p) return null
          const own = pool.acquire(t.width, t.height)
          own.clear()
          p.buffer.copyRegionInto(own, 0, 0, p.glX, p.glY, p.buffer.width, p.buffer.height)
          return own
        }
        const original = take(t.bufs.original), coverage = take(t.bufs.coverage)
        if (!original || !coverage) { if (original) pool.release(original); if (coverage) pool.release(coverage); s.destroy(); return null }
        s._tiles.set(tile, {
          original, coverage, inkLoad: take(t.bufs.inkLoad), inkSettled: take(t.bufs.inkSettled),
          inkColor: take(t.bufs.inkColor), colorSettled: take(t.bufs.colorSettled),
          strokeInk: null, inkBase: null, strokeColor: null, colorBase: null, filmGesture: -1,
          inkDry: take(t.bufs.inkDry), colorDry: take(t.bufs.colorDry),
        })
      }
      return s
    } finally { sp.dispose() }
  }

'''+s[b:]
s=s.replace('interface SpilledScratch extends ScratchScalars {\n  tiles: Array<{ originX: number; originY: number; width: number; height: number; bufs: Partial<Record<typeof SPILL_TILE_BUFFERS[number], Uint8Array>> }>\n  bytes: number\n}', '''interface ParkedScratchBuffer { buffer: AccumulationBuffer; glX: number; glY: number }
interface SpilledScratch extends ScratchScalars {
  tiles: Array<{ originX: number; originY: number; width: number; height: number; bufs: Partial<Record<typeof SPILL_TILE_BUFFERS[number], ParkedScratchBuffer>> }>
  bytes: number
  dispose(): void
}''')
# Actual diffusion writes are wider than the visible footprint.
s=s.replace('    const w = x1 - x0, h = y1 - y0\n    if (w <= 0 || h <= 0) return null\n    const field = this._diffuseFieldFor', '    const w = x1 - x0, h = y1 - y0\n    if (w <= 0 || h <= 0) return null\n    scratch.noteStorageBounds({ minX: x0, minY: y0, maxX: x1, maxY: y1 })\n    const field = this._diffuseFieldFor')
s=s.replace('    if (!overlaps.length) return false\n    const colour = scratch.paints.size > 1','    if (!overlaps.length) return false\n    scratch.noteStorageBounds({ minX: x0, minY: y0, maxX: x1, maxY: y1 })\n    const colour = scratch.paints.size > 1')
s=s.replace('private _spillJob: { key: string;', 'private _spillJob: { work: Generator<void, SpilledScratch | null, void>; key: string;')
s=s.replace('const job = { key, scratch: c.scratch, usedAt:', 'const job = { work, key, scratch: c.scratch, usedAt:')
s=s.replace('{ this._spillJob = null; this._pumpSpillsLater(); return }', '{ work.return(null); this._spillJob = null; this._pumpSpillsLater(); return }')
s=s.replace('    this._destroyed = true\n    this._paper.destroy()', '    this._destroyed = true\n    this._cancelSpillJob()\n    this._paper.destroy()')
s=s.replace('    this._contextLost = true\n  }','    this._contextLost = true\n    this._cancelSpillJob()\n  }')
s=s.replace('    this._spilledWashes.clear()\n    this._lostWashes.clear()\n    this._ribbonScratchPool.destroy()', '    for (const w of this._spilledWashes.values()) w.spill.dispose()\n    this._spilledWashes.clear()\n    this._lostWashes.clear()\n    this._ribbonScratchPool.destroy()')
s=s.replace("if (k !== key && w.userId === op.userId) { this._spilledWashes.delete(k);", "if (k !== key && w.userId === op.userId) { w.spill.dispose(); this._spilledWashes.delete(k);")
s=s.replace('if (w.target === target) this._spilledWashes.delete(k)', 'if (w.target === target) { w.spill.dispose(); this._spilledWashes.delete(k) }')
s=s.replace('    this._replayRibbonChunks.delete(key)\n    if (keep) {', '    if (this._spillJob?.key === key) this._cancelSpillJob()\n    this._replayRibbonChunks.delete(key)\n    if (keep) {')
s=s.replace('        this._trimSpilled()\n      } else {', '      } else {')
s=s.replace('    c.scratch.destroy()\n  }\n\n  /** (§17.70) _evictChunk', '    c.scratch.destroy()\n    this._trimSpilled()\n  }\n\n  /** (§17.70) _evictChunk')
s=s.replace('      this._trimSpilled()\n      } else {','      } else {')
s=s.replace('      c.scratch.destroy()\n      if (this._gpuBudget', '      c.scratch.destroy()\n      this._trimSpilled()\n      if (this._gpuBudget')
s=s.replace('  private _startSpill(key: string): void {', '''  private _cancelSpillJob(): void {
    const job = this._spillJob
    if (!job) return
    this._spillJob = null
    if (job.timer) clearTimeout(job.timer)
    job.work.return(null)
  }

  private _startSpill(key: string): void {''')
s=s.replace('      if (bytes <= SPILLED_WASHES_MAX_BYTES) break\n      bytes -= w.spill.bytes\n      this._spilledWashes.delete(k)', '      if (bytes <= SPILLED_WASHES_MAX_BYTES && this._washGpuBytes() <= this._gpuBudget) break\n      bytes -= w.spill.bytes\n      w.spill.dispose()\n      this._ribbonScratchPool.trimFree()\n      this._spilledWashes.delete(k)')
s=s.replace('  forget(): void {\n    this._free.clear()\n  }','  forget(): void {\n    this._free.clear()\n    this._allocatedBytes = 0\n    this._freeBytes = 0\n  }')
p.write_text(s)
p=Path('docs/architecture/understanding.yaml');s=p.read_text().replace('    title: Движок\n','    title: Движок\n    issue: 703\n');p.write_text(s)

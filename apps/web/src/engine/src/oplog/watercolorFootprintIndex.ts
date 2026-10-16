export interface FootprintBounds { left: number; top: number; right: number; bottom: number }

/** Conservative broad phase only: callers still check the original capsule
 * geometry. Large bounds fall back to a complete query instead of allocating
 * an unbounded grid. One instance belongs to one layer's current wet period. */
export class WatercolorFootprintIndex {
  private readonly cells = new Map<string, number[]>()
  private readonly oversized: number[] = []
  private readonly all: number[] = []

  private readonly cellSize: number
  private readonly maxCells: number

  constructor(cellSize = 128, maxCells = 256) {
    this.cellSize = cellSize
    this.maxCells = maxCells
  }

  private range(bounds: FootprintBounds): { x0: number; y0: number; x1: number; y1: number } | null {
    if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)
      || bounds.left > bounds.right || bounds.top > bounds.bottom) return null
    return { x0: Math.floor(bounds.left / this.cellSize), y0: Math.floor(bounds.top / this.cellSize),
      x1: Math.floor(bounds.right / this.cellSize), y1: Math.floor(bounds.bottom / this.cellSize) }
  }

  add(id: number, bounds: FootprintBounds): void {
    const range = this.range(bounds)
    if (!range) return
    this.all.push(id)
    if (![range.x0, range.y0, range.x1, range.y1].every(Number.isSafeInteger)
      || (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1) > this.maxCells) {
      this.oversized.push(id)
      return
    }
    for (let y = range.y0; y <= range.y1; y++) for (let x = range.x0; x <= range.x1; x++) {
      const key = `${x},${y}`, cell = this.cells.get(key)
      if (cell) cell.push(id)
      else this.cells.set(key, [id])
    }
  }

  *candidates(bounds: FootprintBounds): IterableIterator<number> {
    const range = this.range(bounds)
    if (!range) return
    if (![range.x0, range.y0, range.x1, range.y1].every(Number.isSafeInteger)
      || (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1) > this.maxCells) {
      yield* this.all
      return
    }
    // Lazy candidates permit the caller to stop once every active component
    // has been touched. Repeated ids from neighboring cells are harmless.
    yield* this.oversized
    for (let y = range.y0; y <= range.y1; y++) for (let x = range.x0; x <= range.x1; x++) {
      yield* this.cells.get(`${x},${y}`) ?? []
    }
  }
}

/** CPU diagnostic oracle; never used to paint. Matches the carry shader's
 * directed positive weights, four legacy denominator terms and face limiter. */
export interface CarryCell {
  cost: number
  volume: number
  p: readonly number[]
  c: readonly number[]
}
export interface CarryGrid { width: number; height: number; cells: readonly CarryCell[] }
export interface CarryParameters {
  stride: number; band: number; costMax: number; phase: boolean
  wet: number; phaseLo: number; phaseHi: number; rate: number; travel: number; power: number
  connected: boolean
}
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const smooth = (lo: number, hi: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}
export function carryNeighbour(grid: CarryGrid, i: number, direction: number, distance: number): number {
  const [dx, dy] = directions[direction], x = i % grid.width + dx * distance, y = Math.floor(i / grid.width) + dy * distance
  return x < 0 || y < 0 || x >= grid.width || y >= grid.height ? -1 : y * grid.width + x
}
/** Exactly wcCarryWeight, including zero weights in the positive denominator. */
export function legacyCarryWeight(grid: CarryGrid, i: number, direction: number, cfg: CarryParameters): number {
  const j = carryNeighbour(grid, i, direction, cfg.stride)
  if (j < 0) return 0
  const a = grid.cells[i], b = grid.cells[j]
  if (b.cost > cfg.band) return 0
  const difference = (b.cost - a.cost) * cfg.costMax
  if (difference > 1e-3) {
    if (cfg.connected) for (let n = 1; n < cfg.stride; n++) if (grid.cells[carryNeighbour(grid, i, direction, n)].cost > cfg.band) return 0
    return Math.min(cfg.stride / difference, 4) ** cfg.power * (1 - smooth(0, cfg.band, b.cost)) ** 1.6
  }
  if (!cfg.phase || cfg.wet <= 0 || a.cost > 1e-5 || b.cost > 1e-5 || cfg.stride > 8 || cfg.phaseHi <= cfg.phaseLo) return 0
  let volume = Math.min(a.volume, b.volume)
  if (volume <= 0) return 0
  for (let n = 1; n < cfg.stride; n++) {
    const cell = grid.cells[carryNeighbour(grid, i, direction, n)]
    if (cell.cost > 1e-5 || cell.volume <= 0) return 0
    volume = Math.min(volume, cell.volume)
  }
  return 4 ** cfg.power * smooth(cfg.phaseLo, cfg.phaseHi, volume)
}
/** The current ridge coefficient is exactly1; cost alone sets capacity. */
const capacity = (cell: CarryCell, band: number): number => 1 - .85 * smooth(0, band, cell.cost)

export function carryFaceOracle(grid: CarryGrid, cfg: CarryParameters, independentZero: boolean): CarryGrid {
  if (cfg.rate < 0 || cfg.travel < 0 || 2 * cfg.rate * cfg.travel > 1) throw Error('Combined positive+zero outgoing bound exceeds available material')
  const weights = grid.cells.map((_, i) => directions.map((_, k) => legacyCarryWeight(grid, i, k, cfg)))
  const sums = weights.map(ws => ws.reduce((a, b) => a + b, 0))
  const result = grid.cells.map(cell => ({ ...cell, p: [...cell.p], c: [...cell.c] }))
  for (let i = 0; i < grid.cells.length; i++) for (const k of [0, 2]) {
    const j = carryNeighbour(grid, i, k, cfg.stride)
    if (j < 0 || grid.cells[i].cost > cfg.band || grid.cells[j].cost > cfg.band) continue
    const a = grid.cells[i], b = grid.cells[j], ca = capacity(a, cfg.band), cb = capacity(b, cfg.band)
    const ta = cfg.travel * a.p[3] / ca, tb = cfg.travel * b.p[3] / cb
    if (ta === tb) continue
    const donor = ta > tb ? i : j, receiver = ta > tb ? j : i, direction = ta > tb ? k : k + 1
    const weight = weights[donor][direction]
    if (!weight) continue
    const plateau = a.cost <= 1e-5 && b.cost <= 1e-5
    const phase = weight / 4 ** cfg.power
    const zeroFace = independentZero && plateau && Math.abs((b.cost - a.cost) * cfg.costMax) <= 1e-3
    const share = zeroFace ? phase / 4 : weight / sums[donor]
    const pairCapacity = 2 * ca * cb / (ca + cb) * (!zeroFace && plateau ? phase : 1)
    const material = grid.cells[donor], amount = cfg.rate * share * Math.min(Math.abs(ta - tb) * pairCapacity, cfg.travel * material.p[3])
    const fraction = amount / Math.max(material.p[3], 5e-5)
    for (let channel = 0; channel < 4; channel++) {
      const dp = material.p[channel] * fraction, dc = material.c[channel] * fraction
      result[donor].p[channel] -= dp; result[receiver].p[channel] += dp
      result[donor].c[channel] -= dc; result[receiver].c[channel] += dc
    }
  }
  return { width: grid.width, height: grid.height, cells: result }
}

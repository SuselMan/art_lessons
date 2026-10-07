import { describe, expect, it } from 'vitest'
import { carryFaceOracle, legacyCarryWeight, type CarryGrid, type CarryParameters } from './zeroCostFaceFlux'
const cfg: CarryParameters = { stride: 1, band: .8, costMax: 16, phase: true, wet: 1, phaseLo: .45, phaseHi: .7, rate: .5, travel: .35, power: 3, connected: true }
const grid = (width: number, mass: number[], cost = mass.map(() => 0), volume = mass.map(() => 1)): CarryGrid => ({ width, height: mass.length / width, cells: mass.map((a, i) => ({ cost: cost[i], volume: volume[i], p: [a * .2, a * .7, a * .8, a], c: [a * .3, a * .4, a * .6, a * .9] })) })
const sum = (g: CarryGrid, field: 'p' | 'c', k: number) => g.cells.reduce((total, c) => total + c[field][k], 0)
describe('independent zero-cost face conservative proof', () => {
  it('bounds combined positive+zero outgoing and keeps every P/C channel nonnegative', () => {
    // Centre has a positive-cost draining face AND three zero faces.
    const input = grid(3, [0, 0, 0, 0, .8, 0, 0, 0, 0], [0, 0, 0, 0, 0, .2, 0, 0, 0])
    const output = carryFaceOracle(input, cfg, true)
    const remainder = output.cells[4].p[3]
    expect(remainder).toBeGreaterThanOrEqual(.8 * (1 - 2 * cfg.rate * cfg.travel))
    for (const cell of output.cells) for (const field of [cell.p, cell.c]) for (const x of field) expect(x).toBeGreaterThanOrEqual(0)
    expect(() => carryFaceOracle(input, { ...cfg, rate: 2, travel: 1 }, true)).toThrow(/Combined/)
  })
  it('conserves all P/C channels without clamp or quantization over many exchanges', () => {
    const original = grid(3, [.05, .9, .15, .2, .8, .05, .1, .4, .3], [0, 0, .2, 0, 0, .3, 0, .1, .4])
    let current = original
    for (let n = 0; n < 100; n++) current = carryFaceOracle(current, cfg, true)
    for (const field of ['p', 'c'] as const) for (let k = 0; k < 4; k++) expect(sum(current, field, k)).toBeCloseTo(sum(original, field, k), 12)
    for (const cell of current.cells) expect(cell.c[0]).toBeCloseTo(cell.p[3] * .3, 12)
  })
  it('has a maximum principle on a zero-only plateau, not a claim about positive transport', () => {
    const original = grid(3, [.1, .8, .15, .2, .6, .1, .12, .3, .2])
    const output = carryFaceOracle(original, cfg, true)
    expect(Math.min(...output.cells.map(c => c.p[3]))).toBeGreaterThanOrEqual(.1)
    expect(Math.max(...output.cells.map(c => c.p[3]))).toBeLessThanOrEqual(.8)
  })
  it('leaves positive faces and their denominator unchanged when no zero face exists', () => {
    const input = grid(3, [.7, .2, .4], [.05, .2, .4])
    expect(carryFaceOracle(input, cfg, true)).toEqual(carryFaceOracle(input, cfg, false))
  })
  it('keeps zero terms inside legacy positive normalization at a mixed boundary', () => {
    const input = grid(3, [.8, .4, .2], [0, 0, .2])
    const positive = legacyCarryWeight(input, 1, 0, cfg), zero = legacyCarryWeight(input, 1, 1, cfg)
    expect(zero).toBe(64)
    expect(positive / (positive + zero)).toBeLessThan(1)
  })
  it('never jumps a dry/cost gap and respects phase, stride and empty pigment gates', () => {
    const blocked = grid(3, [.8, 0, 0], [0, 1, 0])
    expect(carryFaceOracle(blocked, { ...cfg, stride: 2 }, true)).toEqual(blocked)
    const dry = grid(3, [.8, 0, 0], [0, 0, 0], [1, 0, 1])
    expect(carryFaceOracle(dry, { ...cfg, stride: 2 }, true)).toEqual(dry)
    const empty = grid(2, [0, 0, 0, 0])
    expect(carryFaceOracle(empty, cfg, true)).toEqual(empty)
    const pair = grid(2, [.8, 0])
    expect(carryFaceOracle(pair, { ...cfg, phase: false }, true)).toEqual(pair)
    expect(carryFaceOracle(pair, { ...cfg, wet: 0 }, true)).toEqual(pair)
  })
})

/** Literal legacy shader gather: deliberately separate from the paired-face
 * implementation. No FIT/UNORM conversion here: compare the transport maths. */
function legacyShaderGather(input: CarryGrid, config: CarryParameters): CarryGrid {
  const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x / config.band)); return t * t * (3 - 2 * t) }
  const cap = input.cells.map(c => 1 - .85 * smooth(c.cost))
  const weights = input.cells.map((_, i) => [0, 1, 2, 3].map(k => legacyCarryWeight(input, i, k, config)))
  const sums = weights.map(ws => ws.reduce((a, b) => a + b, 0))
  return { ...input, cells: input.cells.map((cell, i) => {
    const out = { ...cell, p: [...cell.p], c: [...cell.c] }
    if (cell.cost > config.band) return out
    const ti = config.travel * cell.p[3] / cap[i]
    for (let k = 0; k < 4; k++) {
      const dx = k === 0 ? config.stride : k === 1 ? -config.stride : 0
      const dy = k === 2 ? config.stride : k === 3 ? -config.stride : 0
      const x = i % input.width + dx, y = Math.floor(i / input.width) + dy
      if (x < 0 || y < 0 || x >= input.width || y >= input.height) continue
      const j = y * input.width + x, neighbour = input.cells[j]
      let capacity = 2 * cap[i] * cap[j] / (cap[i] + cap[j])
      if (cell.cost <= 1e-5 && neighbour.cost <= 1e-5) capacity *= weights[i][k] / 4 ** config.power
      const tj = config.travel * neighbour.p[3] / cap[j]
      const give = weights[i][k] > 0 ? config.rate * weights[i][k] / sums[i] * Math.min(Math.max(ti - tj, 0) * capacity, config.travel * cell.p[3]) / Math.max(cell.p[3], 5e-5) : 0
      const back = k === 0 ? 1 : k === 1 ? 0 : k === 2 ? 3 : 2
      const take = tj > ti && neighbour.cost <= config.band && weights[j][back] > 0 ? config.rate * weights[j][back] / sums[j] * Math.min((tj - ti) * capacity, config.travel * neighbour.p[3]) / Math.max(neighbour.p[3], 5e-5) : 0
      for (let c = 0; c < 4; c++) {
        out.p[c] -= cell.p[c] * give; out.p[c] += neighbour.p[c] * take
        out.c[c] -= cell.c[c] * give; out.c[c] += neighbour.c[c] * take
      }
    }
    return out
  }) }
}
it('matches the literal old shader gather with the actual legacy zero-inclusive sum', () => {
  const original = grid(3, [.3, .8, .15, .2, .5, .1, .2, .4, .1], [0, 0, .2, 0, 0, .3, 0, .1, .4])
  for (const stride of [1, 2]) for (const phase of [false, true]) {
    const config = { ...cfg, stride, phase }
    const gather = legacyShaderGather(original, config), face = carryFaceOracle(original, config, false)
    for (let i = 0; i < original.cells.length; i++) for (const field of ['p', 'c'] as const) for (let k = 0; k < 4; k++) expect(face.cells[i][field][k]).toBeCloseTo(gather.cells[i][field][k], 14)
  }
})

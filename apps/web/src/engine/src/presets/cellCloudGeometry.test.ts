import { describe, expect, it } from 'vitest'
import { cellCloudGeometry, cellCloudLayout, type CellCloudConfig, type CellCloudInput } from './cellCloudGeometry'

const config = (patch: Partial<CellCloudConfig> = {}): CellCloudConfig => ({
  cloudDiameter: 20, cellWidth: 20, cellHeight: 20, scale: 1, lodScale: 1,
  offsetX: 0, offsetY: 0, divisionLevel: 0, pressureDivision: false,
  verticalBorder: 0, horizontalBorder: 0, randomBorder: false, fillBackground: false, shape: 1, ...patch,
})
const point = (x = 0, y = 0, pressure = 1): CellCloudInput => ({ x, y, pressure })
const budget = { maxCells: 10000 }
const cells = (c: CellCloudConfig, input = point()) => [...cellCloudGeometry(c, input, budget)]

describe('isolated cell cloud geometry source-law witnesses', () => {
  it('resolves actual missing-diameter source default20 to one cell, while size100 makes25 with spacing20', () => {
    expect(cells(config())).toEqual([{ kind: 'cell', column: 0, row: 0, shape: 1,
      rect: { x: 0, y: 0, width: 20, height: 20 }, integerRect: { x: 0, y: 0, width: 20, height: 20 }, sample: { x: 10, y: 10 } }])
    const large = config({ cloudDiameter: 100 })
    expect(cells(large)).toHaveLength(25)
    expect(cellCloudLayout(large, point(), budget).spacing).toBe(20)
    expect(cellCloudLayout(config({ cellHeight: 5, divisionLevel: 3 }), point(), budget).spacing).toBe(20)
  })
  it('uses signed remainder at negative epsilon/exact boundaries rather than floor snapping', () => {
    for (const [x, origin] of [[-40.1, -40], [-20.1, -20], [-19.9, 0], [-0.001, 0], [0, 0], [19.9, 0], [20, 20]]) {
      expect(cellCloudLayout(config(), point(x), budget).origin.x).toBe(origin)
    }
  })
  it('truncates pressure division before scale tie rounding and retains anisotropic cell dimensions', () => {
    const c = config({ divisionLevel: 3, pressureDivision: true, scale: 1.5, cellHeight: 10 })
    const l = cellCloudLayout(c, point(0, 0, 0.8), budget)
    expect(l.division).toBe(3) // trunc(3*.8)=2; round(1.5*2)=3, not round(3.6)=4
    expect([l.stepX, l.stepY, l.spacing]).toEqual([10, 5, 30])
    expect(cellCloudLayout(config({ divisionLevel: 1, scale: 1.5 }), point(), budget).division).toBe(2)
    expect(cellCloudLayout(config({ divisionLevel: -3 }), point(), budget).division).toBe(1)
    expect(cellCloudLayout(c, point(0, 0, 0), budget).division).toBe(1)
  })
  it('enumerates fractional counts row-major without clipping final cells to cloud extent', () => {
    const c = config({ cloudDiameter: 25, cellWidth: 20, cellHeight: 10 })
    const result = cells(c)
    expect(result.map(e => e.kind === 'cell' ? [e.column, e.row] : null)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]])
    expect(cellCloudLayout(c, point(), budget)).toMatchObject({ columns: 2, rows: 3 })
    expect(result.at(-1)).toMatchObject({ rect: { x: 20, y: 20, width: 20, height: 10 } })
  })
  it('scales geometry and borders by LOD but not authored offsets; source angles are not applied', () => {
    const c = config({ scale: 2, lodScale: 0.5, offsetX: 3, offsetY: -2, verticalBorder: 2, horizontalBorder: 4 })
    const p = { ...point(21, 12), angle: 2, tiltX: 45, tiltY: -10 }
    const rotated = { ...p, angle: -2, tiltX: 0 }
    expect(cells(c, p)).toEqual(cells(c, rotated))
    expect(cells(c, p)[0]).toMatchObject({ rect: { x: 4, y: 0, width: 18, height: 16 } })
  })
  it('normalizes oversized borders instead of clamping or dropping cells; int conversion truncates toward zero', () => {
    const result = cells(config({ offsetX: -0.4, offsetY: -0.6, verticalBorder: 12, horizontalBorder: 11 }))
    expect(result[0]).toMatchObject({ rect: { x: 7.6, y: 8.4, width: 4, height: 2 }, integerRect: { x: 7, y: 8, width: 4, height: 2 } })
    const negative = cells(config({ offsetX: -0.4, offsetY: -0.6, cellWidth: 2, cellHeight: 2, cloudDiameter: 2 }))
    expect(negative[0]).toMatchObject({ rect: { x: -0.4, y: -0.6 }, integerRect: { x: 0, y: 0 } })
  })
  it('emits optional outward-aligned background for only the first base cell before any subcells', () => {
    const result = cells(config({ cloudDiameter: 100, offsetX: 0.25, offsetY: -0.25, fillBackground: true, divisionLevel: 2 }))
    expect(result[0]).toEqual({ kind: 'background', rect: { x: -40, y: -21, width: 21, height: 21 } })
    expect(result).toHaveLength(101)
  })
  it('carries all five shape IDs and float geometry without claiming a primitive raster', () => {
    for (const shape of [0, 1, 2, 3, 4] as const) expect(cells(config({ shape }))[0]).toMatchObject({ shape, rect: { width: 20, height: 20 } })
  })
  it('draws one equal-border value or two ordered values lazily, then permits caller color draws between cells', () => {
    const calls: number[] = [], values = [0.25, 0.5, 0.75, 1]
    const random = () => { const value = values[calls.length]; calls.push(value); return value }
    const g = cellCloudGeometry(config({ cloudDiameter: 40, randomBorder: true, verticalBorder: 2, horizontalBorder: 2 }), point(), budget, random)
    expect(calls).toEqual([])
    expect(g.next().value).toMatchObject({ rect: { width: 19, height: 19 } })
    expect(calls).toEqual([0.25])
    random() // first cell's optional caller-owned color work
    g.next()
    expect(calls).toEqual([0.25, 0.5])
    random()
    expect(calls).toEqual([0.25, 0.5, 0.75])
    g.return(undefined)
    const ordered: number[] = []
    const unequal = cellCloudGeometry(config({ randomBorder: true, verticalBorder: 4, horizontalBorder: 8 }), point(), budget,
      () => { ordered.push(ordered.length); return ordered.length === 1 ? 0.25 : 0.5 })
    expect(unequal.next().value).toMatchObject({ rect: { width: 18, height: 12 } })
    expect(ordered).toEqual([0, 1]); unequal.return(undefined)
  })
  it('draws borders before background without scheduling caller color work, even with normalized inversion', () => {
    const calls: string[] = []
    const g = cellCloudGeometry(config({ randomBorder: true, verticalBorder: 30, horizontalBorder: 40, fillBackground: true }), point(), budget,
      () => { calls.push('border'); return 1 })
    expect(g.next().value).toMatchObject({ kind: 'background' })
    expect(calls).toEqual(['border', 'border'])
    expect(g.next().value).toMatchObject({ kind: 'cell', rect: { x: -10, y: -20, width: 40, height: 60 }, sample: { x: 10, y: 10 } })
    expect(calls).toHaveLength(2)
    g.return(undefined)
  })
  it('consumes even enabled zero-border draw, but none when disabled; never invents a random source', () => {
    let calls = 0
    const random = () => { calls++; return 0 }
    Array.from(cellCloudGeometry(config({ randomBorder: true }), point(), budget, random))
    expect(calls).toBe(1)
    Array.from(cellCloudGeometry(config(), point(), budget, random))
    expect(calls).toBe(1)
    expect(() => cells(config({ randomBorder: true }))).toThrow(/explicit random/)
    expect(() => [...cellCloudGeometry(config({ randomBorder: true }), point(), budget, () => NaN)]).toThrow(/normalized/)
  })
  it('rejects work budgets/range and invalid input before yielding anything or consuming random', () => {
    let calls = 0
    const random = () => { calls++; return 0.5 }
    for (const [c, input, maxCells] of [
      [config({ cloudDiameter: 100, randomBorder: true }), point(), 24],
      [config({ scale: 0 }), point(), 10], [config({ lodScale: NaN }), point(), 10],
      [config(), point(Infinity), 10], [config(), point(0, 0, -0.1), 10],
      [config({ verticalBorder: 1e20 }), point(), 10], [config(), point(0x7ffffffe), 10], [config(), point(1e20), 10],
      [config({ divisionLevel: 1.5 }), point(), 10], [config({ cloudDiameter: 1e100 }), point(), 1e6],
      [config(), point(), 0],
    ] as const) {
      const g = cellCloudGeometry(c, input, { maxCells }, random)
      expect(() => g.next()).toThrow(RangeError)
    }
    expect(calls).toBe(0)
    expect(cells(config({ cloudDiameter: 100 }))).toHaveLength(25)
  })
})

/** Isolated geometry research; no renderer/importer admission uses this module.
 * Independent mathematics from the pinned grid source contract, not vendor code.
 * Provenance: fixes-v42/grid-next.md, Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f.
 * Colors, source snapshots, native primitive rasterization and compositing remain
 * separate future capabilities. No angle/tilt rotation belongs to this lattice.
 */
export type CellCloudShape = 0 | 1 | 2 | 3 | 4
export interface CellCloudConfig {
  cloudDiameter: number
  cellWidth: number
  cellHeight: number
  scale: number
  lodScale: number
  offsetX: number
  offsetY: number
  divisionLevel: number
  pressureDivision: boolean
  verticalBorder: number
  horizontalBorder: number
  randomBorder: boolean
  fillBackground: boolean
  shape: CellCloudShape
}
export interface CellCloudInput { x: number; y: number; pressure: number }
export interface CellCloudRect { x: number; y: number; width: number; height: number }
export interface CellCloudBudget { maxCells: number }
export type CellCloudEvent =
  | { kind: 'background'; rect: CellCloudRect }
  | { kind: 'cell'; column: number; row: number; shape: CellCloudShape; rect: CellCloudRect;
      /** Native shape1 fill crosses a qint32 API boundary; other shapes use rect. */
      integerRect: CellCloudRect; sample: { x: number; y: number } }
export interface CellCloudLayout {
  origin: { x: number; y: number }
  cloudExtent: number
  cellWidth: number
  cellHeight: number
  division: number
  stepX: number
  stepY: number
  columns: number
  rows: number
  /** Isotropic source spacing, independent of cloud diameter/subdivision. */
  spacing: number
  background: CellCloudRect
}
const INT_MIN = -0x80000000
const INT_MAX = 0x7fffffff
function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Nonfinite cell cloud geometry')
  return value
}
function positive(value: number): number {
  if (finite(value) <= 0) throw new RangeError('Cell cloud extent/scale must be positive')
  return value
}
function int32(value: number): number {
  const integer = Math.trunc(finite(value))
  if (integer < INT_MIN || integer > INT_MAX) throw new RangeError('Cell cloud qint32 range exceeded')
  return integer === 0 ? 0 : integer
}
/** Qt qRound rounds ties away from zero (Math.round differs for negatives). */
function roundAway(value: number): number {
  finite(value)
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5)
}
function integerRect(rect: CellCloudRect): CellCloudRect {
  const result = { x: int32(rect.x), y: int32(rect.y), width: int32(rect.width), height: int32(rect.height) }
  if ((result.width > 0 && result.x + result.width - 1 > INT_MAX)
    || (result.height > 0 && result.y + result.height - 1 > INT_MAX))
    throw new RangeError('Cell cloud qint32 rectangle edge exceeded')
  return result
}
function normalized(x: number, y: number, width: number, height: number): CellCloudRect {
  return { x: width < 0 ? x + width : x, y: height < 0 ? y + height : y,
    width: Math.abs(width), height: Math.abs(height) }
}
function aligned(rect: CellCloudRect): CellCloudRect {
  const x = Math.floor(rect.x), y = Math.floor(rect.y)
  return integerRect({ x, y, width: Math.ceil(rect.x + rect.width) - x,
    height: Math.ceil(rect.y + rect.height) - y })
}
/** Resolve and reject the entire cloud's work/range before any event or draw.
 * Explicit bounds are a caller policy; no partial cloud or silent truncation.
 */
export function cellCloudLayout(config: CellCloudConfig, input: CellCloudInput, budget: CellCloudBudget): CellCloudLayout {
  const { cloudDiameter, cellWidth, cellHeight, scale, lodScale, divisionLevel,
    offsetX, offsetY, verticalBorder, horizontalBorder, pressureDivision,
    randomBorder, fillBackground, shape } = config
  positive(cloudDiameter); positive(cellWidth); positive(cellHeight); positive(scale); positive(lodScale)
  finite(input.x); finite(input.y); finite(offsetX); finite(offsetY); finite(verticalBorder); finite(horizontalBorder)
  if (!Number.isInteger(divisionLevel) || int32(divisionLevel) !== divisionLevel
    || !Number.isInteger(cellWidth) || !Number.isInteger(cellHeight)
    || int32(cellWidth) !== cellWidth || int32(cellHeight) !== cellHeight
    || !Number.isFinite(input.pressure) || input.pressure < 0 || input.pressure > 1
    || typeof pressureDivision !== 'boolean' || typeof randomBorder !== 'boolean' || typeof fillBackground !== 'boolean'
    || ![0, 1, 2, 3, 4].includes(shape)) throw new RangeError('Invalid cell cloud source configuration')
  if (!Number.isSafeInteger(budget.maxCells) || budget.maxCells < 1) throw new RangeError('Invalid cell cloud budget')
  const diameter = positive(cloudDiameter * scale * lodScale)
  const width = positive(cellWidth * scale * lodScale), height = positive(cellHeight * scale * lodScale)
  const firstDivision = int32(pressureDivision ? divisionLevel * input.pressure : divisionLevel)
  const division = Math.max(1, int32(roundAway(scale * firstDivision)))
  const stepX = positive(width / division), stepY = positive(height / division)
  const columns = Math.ceil(positive(diameter / stepX)), rows = Math.ceil(positive(diameter / stepY))
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns > budget.maxCells / rows)
    throw new RangeError('Cell cloud cell budget exceeded')
  // JS remainder and C++ fmod both retain the dividend's sign. Do not use floor/mod.
  const rawX = finite(input.x - diameter / 2 + width / 2 - offsetX)
  const rawY = finite(input.y - diameter / 2 + height / 2 - offsetY)
  const x = finite(rawX - rawX % width + offsetX), y = finite(rawY - rawY % height + offsetY)
  const background = aligned({ x, y, width, height })
  // All cells share dimensions. Checking the extremal corners also covers any
  // random border multiplier in [0,1], including normalized inverted borders.
  for (const bx of [0, finite(verticalBorder * lodScale)]) {
    for (const by of [0, finite(horizontalBorder * lodScale)]) {
      for (const column of [0, columns - 1]) for (const row of [0, rows - 1]) {
        const rect = normalized(x + column * stepX + bx, y + row * stepY + by, stepX - 2 * bx, stepY - 2 * by)
        integerRect(rect); finite(rect.x + rect.width); finite(rect.y + rect.height)
      }
    }
  }
  return { origin: { x, y }, cloudExtent: diameter, cellWidth: width, cellHeight: height, division,
    stepX, stepY, columns, rows, spacing: positive(cellWidth * scale * lodScale), background }
}
/** Lazy per-dab event stream. Border draws occur once before background/cells;
 * caller color work may draw between yielded cells without pre-consumption.
 * Caller owns the explicit sequential source; this module invents no RNG/hash.
 */
export function* cellCloudGeometry(config: CellCloudConfig, input: CellCloudInput, budget: CellCloudBudget,
  random?: () => number): Generator<CellCloudEvent> {
  const layout = cellCloudLayout(config, input, budget)
  const { randomBorder, fillBackground, shape, lodScale, verticalBorder, horizontalBorder } = config
  let bx = verticalBorder * lodScale, by = horizontalBorder * lodScale
  if (randomBorder) {
    if (!random) throw new RangeError('Random border requires explicit random source')
    const draw = (): number => {
      const value = random()
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Invalid normalized random source value')
      return value
    }
    if (bx === by) { bx *= draw(); by = bx } else { bx *= draw(); by *= draw() }
  }
  if (fillBackground) yield { kind: 'background', rect: { ...layout.background } }
  for (let row = 0; row < layout.rows; row++) for (let column = 0; column < layout.columns; column++) {
    const rect = normalized(layout.origin.x + column * layout.stepX + bx,
      layout.origin.y + row * layout.stepY + by, layout.stepX - 2 * bx, layout.stepY - 2 * by)
    yield { kind: 'cell', column, row, shape, rect, integerRect: integerRect(rect),
      sample: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } }
  }
}

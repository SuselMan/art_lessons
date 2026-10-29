/**
 * Isolated source-informed mathematical coverage experiment. NOT integrated.
 * Qt 5.15.13 QOutlineMapper/QBezier specifies flatten tolerance and qRound26.6;
 * FreeType/Qt gray raster specifies 8.8 cell area and floor-before-abs coverage.
 * This implementation integrates rational boundary intersections directly. It
 * does not translate Qt/FreeType's DDA, cell linked lists or raster control flow.
 * No upstream source text copied. Source-informed is NOT a cleanroom claim or
 * a determination of license compatibility; see sourceCubicCoverage.provenance.md.
 */
export type CubicPathElement = readonly [number, number, number];
export type CoverageBounds = readonly [number, number, number, number];
type Point = readonly [number, number];
type Segment = readonly [Point, Point];
const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) * .5, (a[1] + b[1]) * .5];

function flatten(a: Point, b: Point, c: Point, d: Point, output: Point[], depth = 9): void {
  const dx = d[0] - a[0], dy = d[1] - a[1];
  const length = Math.abs(dx) + Math.abs(dy);
  const error = length > 1
    ? Math.abs(dx * (a[1] - b[1]) - dy * (a[0] - b[0]))
      + Math.abs(dx * (a[1] - c[1]) - dy * (a[0] - c[0]))
    : Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]);
  if (error < .25 * Math.max(1, length) || depth === 0) { output.push(d); return; }
  const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d);
  const abc = midpoint(ab, bc), bcd = midpoint(bc, cd), middle = midpoint(abc, bcd);
  flatten(a, ab, abc, middle, output, depth - 1);
  flatten(middle, bcd, cd, d, output, depth - 1);
}

// Partition a segment by exact integer pixel boundaries. Intersections round
// down in the other axis; all products are guarded within exact JS integers.
function partition(a: Point, b: Point, axis: 0 | 1): Segment[] {
  const delta = b[axis] - a[axis];
  if (delta === 0) return [[a, b]];
  const cuts: number[] = [];
  for (let k = Math.floor(Math.min(a[axis], b[axis]) / 256) + 1;
    k * 256 < Math.max(a[axis], b[axis]); k++) cuts.push(k * 256);
  if (delta < 0) cuts.reverse();
  const points: Point[] = [a];
  for (const cut of cuts) {
    const other = axis === 0 ? 1 : 0;
    const coordinate = a[other] + Math.floor((cut - a[axis]) * (b[other] - a[other]) / delta);
    points.push(axis === 0 ? [cut, coordinate] : [coordinate, cut]);
  }
  points.push(b);
  return points.slice(1).map((point, i) => [points[i], point]);
}

/** Single closed cubic contour, identity scale and integer raster translation.
 * Unsupported: AA-off, multiple/open contours, line/quadratic elements,
 * transformed painter matrix, huge paths/windows. No implicit approximations.
 */
export function sourceCubicCoverage(
  elements: readonly CubicPathElement[], bounds: CoverageBounds, antialias = true,
): Uint8Array {
  const [ox, oy, width, height] = bounds;
  if (!antialias) throw new RangeError('AA-off uses a different rasterizer');
  if (!bounds.every(Number.isSafeInteger) || width < 0 || height < 0
    || width > 512 || height > 512 || Math.abs(ox) > 1e6 || Math.abs(oy) > 1e6
    || elements.length > 100) throw new RangeError('Unsupported raster bounds/path size');
  const output = new Uint8Array(width * height);
  if (!elements.length) return output;
  if (elements[0][2] !== 0 || elements.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)
    || Math.abs(x - ox) > 1024 || Math.abs(y - oy) > 1024)) throw new RangeError('Unsupported path coordinates');
  const points: Point[] = [[elements[0][0], elements[0][1]]];
  for (let i = 1; i < elements.length; i += 3) {
    if (elements[i][2] !== 2 || i + 2 >= elements.length
      || elements[i + 1][2] !== 3 || elements[i + 2][2] !== 3) throw new RangeError('Only cubic contour supported');
    flatten(points[points.length - 1], [elements[i][0], elements[i][1]],
      [elements[i + 1][0], elements[i + 1][1]], [elements[i + 2][0], elements[i + 2][1]], points);
  }
  const last = points[points.length - 1];
  if (last[0] !== points[0][0] || last[1] !== points[0][1]) throw new RangeError('Open contour unsupported');
  const qRound = (v: number) => v >= 0 ? Math.floor(v + .5) : Math.ceil(v - .5);
  const fixed: Point[] = points.map(([x, y]) => [qRound((x - ox) * 64) * 4, qRound((y - oy) * 64) * 4]);
  const rows = new Map<number, Map<number, { area: number; cover: number }>>();
  for (let i = 1; i < fixed.length; i++) {
    for (const [a, b] of partition(fixed[i - 1], fixed[i], 1)) {
      if (a[1] === b[1]) continue;
      const y = Math.floor(Math.min(a[1], b[1]) / 256);
      if (y < 0 || y >= height) continue;
      let row = rows.get(y);
      if (!row) { row = new Map(); rows.set(y, row); }
      for (const [u, v] of partition(a, b, 0)) {
        const x = Math.floor(Math.min(u[0], v[0]) / 256);
        const cell = row.get(x) ?? { area: 0, cover: 0 };
        const delta = v[1] - u[1];
        cell.area += (u[0] + v[0] - x * 512) * delta;
        cell.cover += delta;
        row.set(x, cell);
      }
    }
  }
  for (const [y, row] of rows) {
    let cover = 0, previous = 0;
    for (const [x, cell] of [...row.entries()].sort((a, b) => a[0] - b[0])) {
      output.fill(Math.min(255, Math.abs(cover)), y * width + Math.max(0, previous), y * width + Math.max(0, Math.min(width, x)));
      cover += cell.cover;
      if (x >= 0 && x < width) output[y * width + x] = Math.min(255, Math.abs(Math.floor((cover * 512 - cell.area) / 512)));
      previous = x + 1;
    }
    if (previous < width) output.fill(Math.min(255, Math.abs(cover)), y * width + Math.max(0, previous), (y + 1) * width);
  }
  return output;
}

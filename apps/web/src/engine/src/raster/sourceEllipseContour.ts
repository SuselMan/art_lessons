import type { CoverageBounds, CubicPathElement } from './sourceCubicCoverage';

/** Isolated source-informed ellipse geometry; no production integration.
 * Qt5.15.13 qt_curves_for_arc uses decimal kappa .5522847498 (not the
 * higher precision 4*(sqrt(2)-1)/3). Fresh mathematical construction, not copied
 * implementation text. See sourceCubicCoverage.provenance.md for license limits.
 */
export interface SourceEllipseInput {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

/** Native Spray minimum applies after random size and LOD, even for zero size.
 * It belongs to particle policy, not ellipse path construction.
 */
export function sourceSprayEllipseSize(width: number, height: number, randomScale: number, lod: number): readonly [number, number] {
  if (![width, height, randomScale, lod].every(Number.isFinite)
    || width < 0 || height < 0 || randomScale < 0 || lod <= 0) throw new RangeError('Invalid spray ellipse size');
  const result = [Math.max(lod, width * randomScale * lod), Math.max(lod, height * randomScale * lod)] as const;
  if (!result.every(Number.isFinite)) throw new RangeError('Overflowed spray ellipse size');
  return result;
}

// Evaluate a cubic with de Casteljau interpolation. Extrema roots derive
// from its derivative; control points themselves do not bound the painted path.
function extrema(a: number, b: number, c: number, d: number): number[] {
  const qa = 3 * (-a + 3 * b - 3 * c + d);
  const qb = 6 * (a - 2 * b + c);
  const qc = 3 * (b - a);
  const roots: number[] = [];
  if (Math.abs(qa) <= 1e-12) {
    if (Math.abs(qb) > 1e-12) roots.push(-qc / qb);
  } else {
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const reciprocal = 1 / (2 * qa);
      roots.push((-qb + root) * reciprocal, (-qb - root) * reciprocal);
    }
  }
  return [a, d, ...roots.filter(t => t > 0 && t < 1).map(t => {
    let layer = [a, b, c, d];
    while (layer.length > 1) layer = layer.slice(1).map((value, i) => layer[i] * (1 - t) + value * t);
    return layer[0];
  })];
}

export function sourceEllipseContour(input: SourceEllipseInput): {
  elements: CubicPathElement[]; bounds: CoverageBounds;
} {
  const { x, y, width, height, angle } = input;
  if (![x, y, width, height, angle].every(Number.isFinite) || width < 0 || height < 0
    || width > 400 || height > 400 || Math.abs(x) > 1e6 || Math.abs(y) > 1e6
    || Math.abs(angle) > 1e6) throw new RangeError('Unsupported ellipse geometry');
  // QPainterPath.addEllipse returns an empty path for a null (0x0) rect.
  // Its empty boundingRect is origin-based, regardless of the transform.
  if (width === 0 && height === 0) return { elements: [], bounds: [-1, -1, 2, 2] };
  if (width === 0 || height === 0) throw new RangeError('Degenerate line ellipse unsupported');
  const rx = width / 2, ry = height / 2, kx = rx * .5522847498, ky = ry * .5522847498;
  const local: readonly (readonly [number, number])[] = [
    [rx, 0], [rx, ky], [kx, ry], [0, ry], [-kx, ry], [-rx, ky], [-rx, 0],
    [-rx, -ky], [-kx, -ry], [0, -ry], [kx, -ry], [rx, -ky], [rx, 0],
  ];
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  // Numerically negligible matrix terms select simpler native map categories.
  const rotated = Math.abs(sine) > 1e-12;
  const scaled = !rotated && Math.abs(cosine - 1) > 1e-12;
  const translated = rotated || scaled || Math.abs(x) > 1e-12 || Math.abs(y) > 1e-12;
  const mapX = (px: number, py: number) => rotated ? cosine * px + -sine * py + x
    : scaled ? cosine * px + x : translated ? px + x : px;
  const mapY = (px: number, py: number) => rotated ? sine * px + cosine * py + y
    : scaled ? cosine * py + y : translated ? py + y : py;
  const elements: CubicPathElement[] = local.map(([px, py], i) => [
    mapX(px, py), mapY(px, py),
    i === 0 ? 0 : i % 3 === 1 ? 2 : 3,
  ]);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 12; i += 3) {
    xs.push(...extrema(elements[i][0], elements[i + 1][0], elements[i + 2][0], elements[i + 3][0]));
    ys.push(...extrema(elements[i][1], elements[i + 1][1], elements[i + 2][1], elements[i + 3][1]));
  }
  const left = Math.floor(Math.min(...xs)) - 1, top = Math.floor(Math.min(...ys)) - 1;
  const right = Math.ceil(Math.max(...xs)) + 1, bottom = Math.ceil(Math.max(...ys)) + 1;
  return { elements, bounds: [left, top, right - left, bottom - top] };
}

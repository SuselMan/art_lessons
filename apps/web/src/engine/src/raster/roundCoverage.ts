/** Independent CPU reference for the squared-distance circle band and clipped
 * circle difference in Krita bd6e8d0, kis_marker_painter.cpp / kis_algebra_2d.cpp.
 * Sources: https://invent.kde.org/graphics/krita/-/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/libs/image/kis_marker_painter.cpp
 * and libs/global/kis_algebra_2d.{h,cpp} at the same revision.
 * Not connected to a renderer. Coordinates are world pixel CENTRES: native
 * integer samples and its input-centre-minus-.5 convention are equivalent.
 * Caller owns size admission, bounds iteration and the stroke-only max-alpha
 * store: replace the entire pigment pixel ONLY when new alpha > stored alpha.
 * This helper neither composites OVER nor replaces colour on equal alpha.
 */
export interface CoveragePoint { readonly x: number; readonly y: number }
export interface CoverageCircle extends CoveragePoint { readonly radius: number }
type Plane = readonly [CoveragePoint, CoveragePoint];
export interface CircleDifference {
    readonly current: CoverageCircle;
    /** Empty means full-disc fallback, otherwise union of two plane pairs. */
    readonly clips: readonly (readonly [Plane, Plane])[];
}

export function circleBandAlpha(dx: number, dy: number, radius: number): number {
    if (![dx, dy, radius].every(Number.isFinite) || radius < 0) return 0;
    const r2 = radius * radius;
    const coefficient = 1 / ((radius + 1) * (radius + 1) - r2);
    const band = (dx * dx + dy * dy - r2) * coefficient;
    return band > 1 ? 0 : band > 0 ? Math.floor((1 - band) * 255) : 255;
}

function cross(a: CoveragePoint, b: CoveragePoint, p: CoveragePoint): number {
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}
function roots(a: number, b: number, c: number): readonly number[] {
    const d = b * b - 4 * a * c;
    if (Math.abs(d) <= 1e-14) return [-b / (2 * a)];
    if (d < 0) return [];
    return [(-b + Math.sqrt(d)) / (2 * a), (-b - Math.sqrt(d)) / (2 * a)];
}

/** Prepare once per placed circle, not once per pixel. Preserves the pinned
 * native horizontal-intersection asymmetry for changing radii (r2 there).
 * Inner tangency within .001 and fewer than two roots use a full disc.
 */
export function prepareCircleDifference(previous: CoverageCircle | undefined, current: CoverageCircle): CircleDifference {
    const full: CircleDifference = { current: { ...current }, clips: [] };
    if (!previous) return full;
    if (![previous.x, previous.y, previous.radius, current.x, current.y, current.radius].every(Number.isFinite)
        || previous.radius < 0 || current.radius < 0) return full;
    const dx = current.x - previous.x, dy = current.y - previous.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > previous.radius + current.radius || distance < Math.abs(previous.radius - current.radius) + .001) return full;
    const f = .5 * (dx * dx + dy * dy + previous.radius ** 2 - current.radius ** 2);
    let intersections: CoveragePoint[];
    if (Math.abs(dy) < 1e-6) {
        const x = f / dx;
        intersections = roots(1, 0, x * x - current.radius ** 2).map(y => ({ x, y }));
    } else {
        const a = dx / dy, c = f / dy;
        intersections = roots(1 + a * a, -2 * a * c, c * c - previous.radius ** 2)
            .map(x => ({ x, y: c - x * a }));
    }
    if (intersections.length !== 2) return full;
    if (dx * intersections[0].y - dy * intersections[0].x < 0) intersections.reverse();
    const [n0, n1] = intersections.map(p => ({ x: p.x + previous.x, y: p.y + previous.y }));
    const p = { x: previous.x + previous.radius * dx / distance, y: previous.y + previous.radius * dy / distance };
    const q = { x: current.x + current.radius * dx / distance, y: current.y + current.radius * dy / distance };
    return { current: full.current, clips: [[[n0, p], [p, q]], [[q, p], [p, n1]]] };
}

/** True means skip by native half-plane clipping; band coverage is separate.
 * Boundary points are retained. No test against the old disc is substituted:
 * that would erase its one-pixel AA band and differ when radius changes.
 */
export function circleDifferenceShouldSkip(difference: CircleDifference, point: CoveragePoint): boolean {
    return difference.clips.length > 0 && !difference.clips.some(pair =>
        pair.every(([a, b]) => cross(a, b, point) >= 0));
}

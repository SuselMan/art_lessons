// apps/web/src/engine/src/dabs/markerRibbon.ts
var FLOATS_PER_VERTEX = 11;
function nibGeometry(dab, sizeMultiplier, shape = "ellipse", cornerFraction = 0) {
  const semiMinor = dab.size * 0.5 * sizeMultiplier;
  return {
    shape,
    semiMajor: semiMinor * Math.max(dab.aspectRatio, 1),
    semiMinor,
    cornerRadius: semiMinor * cornerFraction,
    angle: dab.angle
  };
}
function tipContactPressure(pressure, radius) {
  if (pressure <= 0) return 0;
  const t = Math.max(0, Math.min(1, radius - 1));
  return Math.max(pressure, 0.06 * (1 - t * t * (3 - 2 * t)));
}
function nibSupport(nib, nx, ny) {
  const { semiMajor: a, semiMinor: b, angle, shape } = nib;
  const c = Math.cos(angle), s = Math.sin(angle);
  const ux = nx * c + ny * s;
  const uy = -nx * s + ny * c;
  let px, py, value;
  if (shape === "roundedBox") {
    const r = Math.min(nib.cornerRadius, a, b);
    const ix = a - r, iy = b - r;
    value = ix * Math.abs(ux) + iy * Math.abs(uy) + r;
    px = Math.sign(ux) * ix + r * ux;
    py = Math.sign(uy) * iy + r * uy;
  } else {
    value = Math.hypot(a * ux, b * uy);
    if (value < 1e-9) return { x: 0, y: 0, value: 0 };
    px = a * a * ux / value;
    py = b * b * uy / value;
  }
  return { x: px * c - py * s, y: px * s + py * c, value };
}
function nibArea(nib) {
  const { semiMajor: a, semiMinor: b } = nib;
  if (nib.shape === "roundedBox") {
    const r = Math.min(nib.cornerRadius, a, b);
    return 4 * a * b - (4 - Math.PI) * r * r;
  }
  return Math.PI * a * b;
}
function nibMeanChord(nib, tx, ty) {
  const width = 2 * nibSupport(nib, -ty, tx).value;
  return width > 1e-6 ? nibArea(nib) / width : 0;
}
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
function lerpDab(d0, d1, t) {
  return {
    ...d0,
    x: d0.x + (d1.x - d0.x) * t,
    y: d0.y + (d1.y - d0.y) * t,
    size: d0.size + (d1.size - d0.size) * t,
    aspectRatio: d0.aspectRatio + (d1.aspectRatio - d0.aspectRatio) * t,
    angle: lerpAngle(d0.angle, d1.angle, t)
  };
}
var MARKER_POSE_STEP_PX = 1;
var MARKER_MAX_SUBSTEPS = 12;
function poseSubdivisions(g0, g1) {
  const reach = Math.max(g0.semiMajor, g1.semiMajor);
  const turn = Math.abs(lerpAngle(g0.angle, g1.angle, 1) - g0.angle) * reach;
  const grow = Math.abs(g1.semiMajor - g0.semiMajor) + Math.abs(g1.semiMinor - g0.semiMinor);
  const drift = turn + grow;
  if (drift <= MARKER_POSE_STEP_PX) return 1;
  return Math.min(MARKER_MAX_SUBSTEPS, Math.ceil(drift / MARKER_POSE_STEP_PX));
}
function outlinePoints(nib, inset, segments) {
  const a = Math.max(nib.semiMajor - inset, 1e-3);
  const b = Math.max(nib.semiMinor - inset, 1e-3);
  const c = Math.cos(nib.angle), s = Math.sin(nib.angle);
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const phi = i / segments * Math.PI * 2;
    let lx, ly;
    if (nib.shape === "roundedBox") {
      const r = Math.min(Math.max(nib.cornerRadius - inset, 0), a, b);
      const ux = Math.cos(phi), uy = Math.sin(phi);
      const m = Math.max(Math.abs(ux) / (a - r || 1e-3), Math.abs(uy) / (b - r || 1e-3));
      lx = ux / m + r * ux;
      ly = uy / m + r * uy;
    } else {
      lx = a * Math.cos(phi);
      ly = b * Math.sin(phi);
    }
    pts.push({ x: lx * c - ly * s, y: lx * s + ly * c });
  }
  return pts;
}
var OUTLINE_SEGMENTS = 16;
function buildRibbonBands(dabs, sizeMultiplier, prevDab, shape = "ellipse", cornerFraction = 0, aaPx = 1, inkFor, fillEveryPose = false) {
  const chain = prevDab ? [prevDab, ...dabs] : dabs;
  if (chain.length < 2) return new Float32Array(0);
  let out = new Float32Array(Math.max(1, chain.length - 1) * (12 + (fillEveryPose ? OUTLINE_SEGMENTS * 9 : 0)) * FLOATS_PER_VERTEX);
  let written = 0;
  const reserve = (required) => {
    if (required <= out.length) return;
    const grown = new Float32Array(Math.max(required, out.length * 2));
    grown.set(out);
    out = grown;
  };
  let ink = 0;
  let inkWater = 0;
  let inkWet = 0;
  let inkStrength = 0;
  let pressure = 1;
  let endPressure = 1;
  let pigmentPool = 0.5;
  let puddle = 1;
  const push = (x, y, edge, across, press = pressure) => {
    out[written] = x;
    out[written + 1] = y;
    out[written + 2] = edge;
    out[written + 3] = ink;
    out[written + 4] = inkWater;
    out[written + 5] = across;
    out[written + 6] = inkWet;
    out[written + 7] = inkStrength;
    out[written + 8] = puddle;
    out[written + 9] = press;
    out[written + 10] = pigmentPool;
    written += FLOATS_PER_VERTEX;
  };
  const quad = (m0, e0, t0, m1, e1, t1, side) => {
    push(m0.x, m0.y, e0, 0);
    push(t0.x, t0.y, 0, side);
    push(t1.x, t1.y, 0, side, endPressure);
    push(m0.x, m0.y, e0, 0);
    push(t1.x, t1.y, 0, side, endPressure);
    push(m1.x, m1.y, e1, 0, endPressure);
  };
  const body = (centre, nib, nx, ny) => {
    const inset = Math.min(aaPx, nib.semiMinor * 0.5);
    const rim = outlinePoints(nib, 0, OUTLINE_SEGMENTS);
    const core = outlinePoints(nib, inset, OUTLINE_SEGMENTS);
    const reach = Math.max(nibSupport(nib, nx, ny).value, 1e-3);
    const across = (p) => Math.max(-1, Math.min(1, (p.x * nx + p.y * ny) / reach));
    for (let i = 0; i < OUTLINE_SEGMENTS; i++) {
      const j = (i + 1) % OUTLINE_SEGMENTS;
      const r0 = { x: centre.x + rim[i].x, y: centre.y + rim[i].y };
      const r1 = { x: centre.x + rim[j].x, y: centre.y + rim[j].y };
      const c0 = { x: centre.x + core[i].x, y: centre.y + core[i].y };
      const c1 = { x: centre.x + core[j].x, y: centre.y + core[j].y };
      const ar0 = across(rim[i]), ar1 = across(rim[j]);
      const ac0 = across(core[i]), ac1 = across(core[j]);
      push(r0.x, r0.y, 0, ar0);
      push(r1.x, r1.y, 0, ar1);
      push(c1.x, c1.y, inset, ac1);
      push(r0.x, r0.y, 0, ar0);
      push(c1.x, c1.y, inset, ac1);
      push(c0.x, c0.y, inset, ac0);
      push(centre.x, centre.y, inset, 0);
      push(c0.x, c0.y, inset, ac0);
      push(c1.x, c1.y, inset, ac1);
    }
  };
  for (let i = 0; i + 1 < chain.length; i++) {
    const d0 = chain[i], d1 = chain[i + 1];
    const travel = Math.hypot(d1.x - d0.x, d1.y - d0.y);
    if (travel < 1e-6) continue;
    if (inkFor) {
      const got = inkFor(d0, d1, travel);
      ink = got.ink;
      inkWater = ink * got.water;
      inkWet = ink * got.paperWet;
      inkStrength = ink * got.strength;
      puddle = got.puddle ?? 1;
      pigmentPool = got.pigmentPool ?? 0.5;
    } else {
      ink = d1.opacity * travel * 0.5;
      inkWater = 0;
      inkWet = 0;
      inkStrength = 0;
      puddle = 1;
      pigmentPool = 0.5;
    }
    const steps = poseSubdivisions(
      nibGeometry(d0, sizeMultiplier, shape, cornerFraction),
      nibGeometry(d1, sizeMultiplier, shape, cornerFraction)
    );
    reserve(written + (steps * 12 + (fillEveryPose ? steps : Math.max(0, steps - 1)) * OUTLINE_SEGMENTS * 9) * FLOATS_PER_VERTEX);
    for (let k = 0; k < steps; k++) {
      const a = k === 0 ? d0 : lerpDab(d0, d1, k / steps);
      const b = k === steps - 1 ? d1 : lerpDab(d0, d1, (k + 1) / steps);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = -dy / len, ny = dx / len;
      const ga = nibGeometry(a, sizeMultiplier, shape, cornerFraction);
      const gb = nibGeometry(b, sizeMultiplier, shape, cornerFraction);
      pressure = tipContactPressure(a.pressure, ga.semiMinor);
      endPressure = tipContactPressure(b.pressure, gb.semiMinor);
      const la = nibSupport(ga, nx, ny), lb = nibSupport(gb, nx, ny);
      const ra = nibSupport(ga, -nx, -ny), rb = nibSupport(gb, -nx, -ny);
      const ca = { x: a.x, y: a.y }, cb = { x: b.x, y: b.y };
      quad(ca, la.value, { x: a.x + la.x, y: a.y + la.y }, cb, lb.value, { x: b.x + lb.x, y: b.y + lb.y }, 1);
      quad(ca, ra.value, { x: a.x + ra.x, y: a.y + ra.y }, cb, rb.value, { x: b.x + rb.x, y: b.y + rb.y }, -1);
      if (k > 0 || fillEveryPose) body(ca, ga, nx, ny);
    }
  }
  return written === out.length ? out : out.slice(0, written);
}
export {
  FLOATS_PER_VERTEX as RIBBON_FLOATS_PER_VERTEX,
  buildRibbonBands,
  lerpDab,
  nibArea,
  nibGeometry,
  nibMeanChord,
  nibSupport,
  outlinePoints,
  poseSubdivisions,
  tipContactPressure
};

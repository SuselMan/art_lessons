// docs/qa/harness/728-native-end-to-end/rimHashCornerTable.ts
var f = Math.fround;
var fract = (x) => f(x - Math.floor(x));
function rimHashOrderedF32(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 65536 || Math.abs(y) > 65536) throw Error("Bounded integer rim corner required");
  const qx = f(17 * fract(f(f(f(x) * f(0.3183099)) + f(0.11)))), qy = f(17 * fract(f(f(f(y) * f(0.3183099)) + f(0.17))));
  return fract(f(f(qx * qy) * f(qx + qy)));
}
function rimHashSeededU32(x, y, seed) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 65536 || Math.abs(y) > 65536 || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw Error("Bounded corner and uint32 paper seed required");
  let h = (Math.imul(x | 0, 2654435761) ^ Math.imul(y | 0, 2246822519) ^ seed) >>> 0;
  h = Math.imul(h ^ h >>> 16, 2146121005) >>> 0;
  h = Math.imul(h ^ h >>> 15, 2221713035) >>> 0;
  h = (h ^ h >>> 16) >>> 0;
  return (h >>> 8) / 16777216;
}
function buildRimHashCornerTable(domain, seed) {
  const { width, height, world } = domain;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || world.some((v) => !Number.isFinite(v)) || world[2] <= 0) throw Error("Bounded rim domain required");
  const coord = (p, o) => f(f(f(f(p) + f(o)) * f(world[2])) * f(0.012));
  const xs = [coord(0.5, world[0]), coord(width - 0.5, world[0])], ys = [coord(0.5, world[1]), coord(height - 0.5, world[1])];
  const axisBounds = (a, offset) => {
    const second = a.map((x) => f(f(x * f(2.7)) + f(offset))), all = [...a, ...second];
    if (all.some((x) => !Number.isFinite(x) || Math.abs(x) > 65534)) throw Error("Rim coordinate range unsupported");
    return [Math.floor(Math.min(...all)) - 1, Math.floor(Math.max(...all)) + 2];
  };
  const xb = axisBounds(xs, 31.4), yb = axisBounds(ys, 17.9), w = xb[1] - xb[0] + 1, h = yb[1] - yb[0] + 1;
  if (w * h > 65536) throw Error("Rim corner table exceeds256KiB bound");
  const values = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) values[y * w + x] = seed === void 0 ? rimHashOrderedF32(xb[0] + x, yb[0] + y) : rimHashSeededU32(xb[0] + x, yb[0] + y, seed);
  return { values, width: w, height: h, origin: [xb[0], yb[0]], domain: { width, height, world: [...world] }, seed: seed ?? null, hashSemantics: seed === void 0 ? "explicit ordered CPU binary32; no FMA" : "seeded uint32 lattice, shared exact24bit float corners", rowConvention: "noise-coordinate rows; no world-top flip", bytes: values.byteLength, limits: "New OFF diagnostic contraction semantics; original GPU pattern not asserted bit-identical. Remaining interpolation/mix may still differ across APIs." };
}
function sampleRimHashCorner(table, x, y) {
  const ix = x - table.origin[0], iy = y - table.origin[1];
  if (!Number.isInteger(ix) || !Number.isInteger(iy) || ix < 0 || iy < 0 || ix >= table.width || iy >= table.height) throw Error("Explicit unsupported corner outside table");
  return table.values[iy * table.width + ix];
}
export {
  buildRimHashCornerTable,
  rimHashOrderedF32,
  rimHashSeededU32,
  sampleRimHashCorner
};

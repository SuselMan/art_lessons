// #573, ADR 013 §11 — the digital brush's bitmap tips.
//
// A textured brush is a round brush whose footprint is a picture instead of a
// radial ramp: chalk is a disc full of holes, a bristle brush is a row of
// separate hair tips, a grass brush is a clump of blades. The picture is the
// whole of the brush's character, so it has to be the same picture on every
// participant's device — the teacher's chalk and the student's copy of it must
// break up in the same places.
//
// That is the paper-grain problem again (.claude/rules.md, "Cross-device pixel
// determinism"), and it is answered the same way in substance: the value is
// computed on the CPU, never by a per-device GPU pass. What differs is *when*:
// the paper is baked offline into a shipped asset because its generator leans
// on a finite difference amplified ~30x, where a GPU's precision fallback shows.
// These masks involve nothing of the kind. Every value below comes out of
// integer hashing, +, -, * and / on doubles and Math.sqrt — all of which IEEE
// 754 defines to the last bit, and every JS engine implements exactly — so the
// result is identical on every client by construction, and generating it at
// startup costs a few milliseconds instead of an asset pipeline and a load
// that a replay would have to wait for.
//
// What this file deliberately never calls: Math.sin/cos/exp/pow/atan2. Those
// are not required to be correctly rounded, and engines genuinely differ in the
// last ulp. A test pins the whole output to a checksum, so a well-meaning edit
// that reaches for one of them fails loudly rather than drifting one device.
//
// Orientation: row 0 is the top of the stamp in world space. DAB_VERT maps the
// quad's local +y to screen-down, and the stamp shader reads the mask at
// `v_localUV * 0.5 + 0.5`, so texture row 0 (t = 0) lands at local y = -1 —
// the top. A grass blade drawn "rooted at the bottom row" therefore grows
// upward on the canvas when the stamp is not rotated.
//
// Local +x is the direction the stamp's angle points. For a tip that follows
// the stroke ('travel' rotation) that is the direction of travel, which is why
// the bristle tip spreads its hairs along y: across the stroke, so each hair
// drags a streak of its own.

/** Side of every mask, in texels. Power of two so WebGL1 can mipmap it — a
 *  bristle brush at 12 px would otherwise alias its 22 hairs into moiré. */
export const TIP_MASK_SIZE = 256

export type TipMaskId = 'chalk' | 'rough' | 'bristle' | 'speckle' | 'grass' | 'leaf'

export const TIP_MASK_IDS: readonly TipMaskId[] = ['chalk', 'rough', 'bristle', 'speckle', 'grass', 'leaf']

// ─── Deterministic noise ────────────────────────────────────────────────────

/** 0..1 from two integer lattice coordinates and a seed. Same integer mix as
 *  brushDabRandom — exact on every engine. */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

/** A deterministic stream of 0..1 values — for placing hairs, blades, specks. */
function stream(seed: number): () => number {
  let i = 0
  return () => hash2(i++, 0x5bd1e995, seed)
}

/** Value noise: hashed lattice, smoothstep-interpolated. `cell` is the lattice
 *  pitch in texels. Polynomial fade only — see the file comment on why no
 *  transcendental function may appear here. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const fx = x / cell
  const fy = y / cell
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  const top = a + (b - a) * sx
  const bottom = c + (d - c) * sx
  return top + (bottom - top) * sy
}

/** Three octaves, normalized back to 0..1. */
function fbm(x: number, y: number, cell: number, seed: number): number {
  return (valueNoise(x, y, cell, seed) * 4
    + valueNoise(x, y, cell / 2, seed + 1) * 2
    + valueNoise(x, y, cell / 4, seed + 2)) / 7
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// ─── The masks ──────────────────────────────────────────────────────────────
//
// Each generator takes the texel's centre in the stamp's own normalized frame,
// u and v in -1..1 (v down), and returns coverage 0..1. Every one of them is
// exactly 0 at the border, which the sampler's CLAMP_TO_EDGE relies on: a
// non-zero edge texel would smear out to the quad's corners.

type MaskFn = (u: number, v: number, px: number, py: number) => number

/** Pastel or chalk on a dry surface: a round stick whose contact is broken up
 *  into grain. The holes are the brush's, not the paper's — the paper adds its
 *  own tooth on top through paperInteraction, and the two together are what a
 *  real chalk stroke looks like. */
const chalk: MaskFn = (u, v, px, py) => {
  const d = Math.sqrt(u * u + v * v)
  const disc = clamp01((0.96 - d) / 0.22)
  if (disc <= 0) return 0
  const grain = fbm(px, py, 12, 11)
  const fine = valueNoise(px, py, 2.5, 17)
  // Thresholded rather than multiplied: chalk is either on a spot or not, and
  // a multiplied grain reads as a grey tint instead of as texture.
  const g = clamp01((grain * 0.7 + fine * 0.3 - 0.36) * 3.2)
  return disc * g
}

/** Block-in paint with a dry, ragged edge — the family Procreate calls Nikko
 *  Rull and CSP calls Gouache: opaque in the middle, broken where the paint
 *  runs out at the rim. The rim is a noise-displaced disc, the interior is
 *  mostly solid with a few dry streaks. */
const rough: MaskFn = (u, v, px, py) => {
  const d = Math.sqrt(u * u + v * v)
  // ±0.15 of displacement against a 0.78 threshold: even the deepest inward
  // wobble at d = 1 lands at 0.85, so the mask is still exactly 0 at the
  // border the note above requires.
  const wobble = fbm(px, py, 40, 23) - 0.5
  const edge = d + wobble * 0.3
  const body = clamp01((0.78 - edge) / 0.1)
  if (body <= 0) return 0
  // Nearly flat inside. An interior texture here was tried and is wrong: the
  // stamps repeat every few pixels, so any pattern inside the mask prints as a
  // regular lattice across the stroke. The breakup inside the mark belongs to
  // the canvas-anchored texture (see the brush textures below); the mask
  // contributes only what it alone can — the ragged rim at the ends.
  const speck = valueNoise(px, py, 3, 31)
  return clamp01(body * (0.92 + 0.08 * speck))
}

/** Separate hair tips in a row across the stroke. Dragged along the path each
 *  tip leaves its own streak, which is the whole look of a bristle brush — no
 *  per-hair simulation needed, because a tip's trail *is* the hair's path when
 *  the tip follows the stroke. Hairs differ in thickness and load, so the
 *  streaks differ in weight, and the outermost are the thinnest and faintest:
 *  a real brush is fuller in the middle. */
function buildBristle(): MaskFn {
  const next = stream(41)
  const hairs: { x: number; y: number; r: number; load: number }[] = []
  const count = 26
  for (let i = 0; i < count; i++) {
    const y = -0.84 + (1.68 * (i + 0.5)) / count + (next() - 0.5) * 0.05
    const middle = 1 - Math.abs(y) / 0.9
    hairs.push({
      x: (next() - 0.5) * 0.35,
      y,
      r: 0.03 + next() * 0.04 * (0.5 + middle),
      load: 0.6 + 0.4 * next() * (0.4 + 0.6 * middle),
    })
  }
  return (u, v) => {
    let best = 0
    for (const h of hairs) {
      const dx = u - h.x
      const dy = v - h.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const c = clamp01((h.r - dist) / (h.r * 0.45)) * h.load
      if (c > best) best = c
    }
    return best
  }
}

/** Fine specks scattered over a disc — the "noise" brush every set carries for
 *  texturing fabric, stone and skin. Denser toward the middle. */
function buildSpeckle(): MaskFn {
  const next = stream(53)
  const specks: { x: number; y: number; r: number; load: number }[] = []
  while (specks.length < 70) {
    const x = next() * 2 - 1
    const y = next() * 2 - 1
    const d2 = x * x + y * y
    if (d2 > 0.8) continue
    // Rejection toward the rim, so the density falls off without a hard edge.
    if (next() < d2) continue
    specks.push({ x, y, r: 0.018 + next() * 0.04, load: 0.5 + next() * 0.5 })
  }
  return (u, v) => {
    let best = 0
    for (const s of specks) {
      const dx = u - s.x
      const dy = v - s.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const c = clamp01((s.r - dist) / (s.r * 0.5)) * s.load
      if (c > best) best = c
    }
    return best
  }
}

/** Distance from (px, py) to the segment a→b, and where along it the nearest
 *  point is (0 at a, 1 at b). */
function segment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  const t = len2 > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / len2) : 0
  const qx = ax + vx * t - px
  const qy = ay + vy * t - py
  return { d: Math.sqrt(qx * qx + qy * qy), t }
}

/** A clump of grass blades rooted along the bottom, leaning a little either
 *  way. Blades taper to a point, since a blunt blade reads as a fence. */
function buildGrass(): MaskFn {
  const next = stream(67)
  const blades: { ax: number; ay: number; bx: number; by: number; w: number; load: number }[] = []
  const count = 9
  for (let i = 0; i < count; i++) {
    const ax = -0.55 + (1.1 * (i + 0.5)) / count + (next() - 0.5) * 0.12
    const height = 0.9 + next() * 0.95
    const lean = (next() - 0.5) * 0.7
    blades.push({
      ax, ay: 0.94,
      bx: ax + lean, by: 0.94 - height,
      w: 0.035 + next() * 0.03,
      load: 0.7 + next() * 0.3,
    })
  }
  return (u, v) => {
    let best = 0
    for (const b of blades) {
      const { d, t } = segment(u, v, b.ax, b.ay, b.bx, b.by)
      const w = b.w * (1 - t * 0.92)
      const c = clamp01((w - d) / 0.012) * b.load
      if (c > best) best = c
    }
    return best
  }
}

/** One leaf, pointed at both ends, lying along x, with a lighter midrib. The
 *  brush scatters and turns it, so a single well-drawn leaf makes foliage;
 *  a bitmap of a whole bush would repeat visibly within one stroke. */
function buildLeaf(): MaskFn {
  return (u, v) => {
    const x = u / 0.9
    if (x <= -1 || x >= 1) return 0
    // Asymmetric: fuller toward the stem end, the way most leaves are.
    const shape = (1 - x * x) * (1 - 0.25 * x)
    const half = 0.42 * shape
    const body = clamp01((half - Math.abs(v)) / 0.025)
    if (body <= 0) return 0
    const rib = clamp01((0.018 - Math.abs(v)) / 0.012) * clamp01((0.8 - x) * 4)
    return body * (1 - 0.45 * rib)
  }
}

const GENERATORS: Record<TipMaskId, () => MaskFn> = {
  chalk: () => chalk,
  rough: () => rough,
  bristle: buildBristle,
  speckle: buildSpeckle,
  grass: buildGrass,
  leaf: buildLeaf,
}

/** The mask at full resolution, row 0 on top, 0..255 per texel. */
export function tipMaskPixels(id: TipMaskId): Uint8Array {
  const fn = GENERATORS[id]()
  const n = TIP_MASK_SIZE
  const out = new Uint8Array(n * n)
  for (let py = 0; py < n; py++) {
    const v = ((py + 0.5) / n) * 2 - 1
    for (let px = 0; px < n; px++) {
      const u = ((px + 0.5) / n) * 2 - 1
      // Edge texels forced to zero: see the note above the generators.
      const edge = px === 0 || py === 0 || px === n - 1 || py === n - 1
      out[py * n + px] = edge ? 0 : Math.round(clamp01(fn(u, v, px, py)) * 255)
    }
  }
  return out
}

/** The full mip chain for one mask, level 0 first, each a 2x2 box average of
 *  the one above in integer arithmetic.
 *
 *  Built here rather than by gl.generateMipmap: the filter a driver uses to
 *  build mips is not specified, and a small stamp reads almost entirely from
 *  the small levels — so leaving them to the driver would put exactly the
 *  device-dependence this file exists to avoid back into every small brush. */
export function tipMaskMips(id: TipMaskId): Uint8Array[] {
  return mipChain(tipMaskPixels(id))
}

function mipChain(base: Uint8Array): Uint8Array[] {
  const levels = [base]
  let size = TIP_MASK_SIZE
  while (size > 1) {
    const src = levels[levels.length - 1]
    const half = size >> 1
    const dst = new Uint8Array(half * half)
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const i = 2 * y * size + 2 * x
        dst[y * half + x] = (src[i] + src[i + 1] + src[i + size] + src[i + size + 1] + 2) >> 2
      }
    }
    levels.push(dst)
    size = half
  }
  return levels
}

// ─── Brush textures (#573) ──────────────────────────────────────────────────
//
// The other half of a textured brush. A tip mask lives in the *stamp's* frame,
// so at the tight spacing a continuous stroke needs, twenty overlapping stamps
// average every hole in it away — a rough rim smooths into a clean one, dry
// streaks fill in. What survives overlap is texture anchored to the *canvas*:
// every stamp reads the same value at the same world point, so a gap stays a
// gap however many stamps pass over it. That is how the paper's tooth already
// gives chalk its grain, and why Procreate's "grain" is a separate, canvas-
// anchored texture from its "shape".
//
// The paper cannot be that texture: it depends on which paper the room has,
// and the smooth one has no tooth at all. So these are the brush's own, tiled
// across the canvas with REPEAT — which is why they are generated seamless.

export type BrushTextureId = 'dry' | 'grit'

export const BRUSH_TEXTURE_IDS: readonly BrushTextureId[] = ['dry', 'grit']

/** Value noise whose lattice wraps at `period` cells, so the result tiles. */
function tileNoise(x: number, y: number, cell: number, period: number, seed: number): number {
  const fx = x / cell
  const fy = y / cell
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const w = (v: number) => ((v % period) + period) % period
  const a = hash2(w(ix), w(iy), seed)
  const b = hash2(w(ix + 1), w(iy), seed)
  const c = hash2(w(ix), w(iy + 1), seed)
  const d = hash2(w(ix + 1), w(iy + 1), seed)
  const top = a + (b - a) * sx
  const bottom = c + (d - c) * sx
  return top + (bottom - top) * sy
}

/** Tileable fbm over a TIP_MASK_SIZE square. Every octave's cell divides the
 *  side exactly, so every octave wraps. */
function tileFbm(x: number, y: number, cell: number, seed: number): number {
  const n = TIP_MASK_SIZE
  return (tileNoise(x, y, cell, n / cell, seed) * 4
    + tileNoise(x, y, cell / 2, n / (cell / 2), seed + 1) * 2
    + tileNoise(x, y, cell / 4, n / (cell / 4), seed + 2)) / 7
}

const TEXTURES: Record<BrushTextureId, (px: number, py: number) => number> = {
  // Dry paint dragged over a rough surface: broad patches where the paint
  // caught and where it skipped, with finer breakup inside them.
  dry: (px, py) => clamp01(tileFbm(px, py, 32, 71) * 0.75 + tileNoise(px, py, 4, TIP_MASK_SIZE / 4, 73) * 0.25),
  // Fine, even grit — pastel and chalk on any paper, the smooth one included.
  grit: (px, py) => clamp01(tileFbm(px, py, 16, 79) * 0.55 + tileNoise(px, py, 2, TIP_MASK_SIZE / 2, 83) * 0.45),
}

/** A texture's full mip chain, level 0 first — 0..255, tileable. The box
 *  filter in tipMaskMips preserves tiling, since each level's texels are
 *  averages of whole 2x2 blocks of a seamless image. */
export function brushTextureMips(id: BrushTextureId): Uint8Array[] {
  const n = TIP_MASK_SIZE
  const base = new Uint8Array(n * n)
  const fn = TEXTURES[id]
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) base[py * n + px] = Math.round(fn(px, py) * 255)
  }
  return mipChain(base)
}

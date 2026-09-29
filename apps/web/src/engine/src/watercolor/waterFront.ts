// (#536, ADR 011 §17.24) The WATER DOMAIN of one operation — the CPU oracle.
//
// What a drop of water does on paper before any pigment moves: it spreads,
// and where it stops is decided by the sheet, not by the brush. The domain
// it wets is wider than the brush's footprint, its edge runs ahead in the
// paper's valleys and stalls on its ridges, and that edge — the drying front
// — is where the pigment of a bloom or a tideline ends up. The design thread
// asked for exactly this before any rim is built on it: a point drop, three
// to six propagation steps over the paper height with a spread budget, one
// threshold, and the contour compared with a photograph of a real bloom.
//
// Pure functions over Float64Array grids so the GPU port (a fragment shader
// with a few taps per step) has a bit-for-bit reference, the same discipline
// as wetDiffusion.ts.

export interface WaterGrid {
  width: number
  height: number
  /** Paper height, 0..1, one per cell. */
  paper: Float64Array
  /** Standing water, one per cell. */
  water: Float64Array
}

export interface WaterFrontParams {
  /** Share of a cell's water offered to its neighbours per step. */
  alpha: number
  /** How strongly a lower neighbour is preferred: weight = exp(slope * (h_i - h_j)). */
  slope: number
  /** Water a DRY cell drinks before it holds any — the spread budget: the
   *  thinner the film, the sooner the front stalls. */
  wettingCost: number
  /** 1: the 8 neighbours; 2: those plus the ring at distance 2 (16 cells). */
  reach: 1 | 2
  /** Below this a cell counts as dry — the domain's threshold, and the
   *  level a cell's water is clamped to zero under after each step. */
  eps: number
}

export const WATER_FRONT_DEFAULT: WaterFrontParams = {
  alpha: 0.55,
  slope: 6,
  wettingCost: 0.045,
  reach: 1,
  eps: 0.02,
}

export function makeWaterGrid(width: number, height: number, paper?: Float64Array): WaterGrid {
  return {
    width, height,
    paper: paper ?? new Float64Array(width * height).fill(0.5),
    water: new Float64Array(width * height),
  }
}

/** A deterministic paper-like height field: two octaves of value noise, the
 *  coarse one the sheet's tooth (period ~8 px), the fine one its grain. For
 *  tests and for the oracle where the baked paper is not at hand. */
export function syntheticPaper(width: number, height: number, seed = 1): Float64Array {
  const hash = (x: number, y: number, s: number): number => {
    let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  const value = (x: number, y: number, period: number, s: number): number => {
    const gx = x / period, gy = y / period
    const x0 = Math.floor(gx), y0 = Math.floor(gy)
    const fx = gx - x0, fy = gy - y0
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s)
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
  }
  const out = new Float64Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = 0.6 * value(x, y, 8, seed) + 0.3 * value(x, y, 3, seed + 7) + 0.1 * value(x, y, 1.5, seed + 13)
    }
  }
  return out
}

/** Puts a drop of `amount` water per cell inside a disc. */
export function dropWater(grid: WaterGrid, cx: number, cy: number, radius: number, amount: number): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) grid.water[y * grid.width + x] += amount
    }
  }
}

const RING1: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
const RING2: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2], [2, 2], [-2, 2], [2, -2], [-2, -2],
]

/** One propagation step, conservative except for what dry cells drink.
 *
 *  Every cell offers `alpha` of its water, split among its neighbours by
 *  weight exp(slope·(h_i − h_j)) · max(0, 1 − w_j/w_i): downhill and into
 *  drier cells only, nothing uphill into a wetter one. A neighbour that was
 *  dry drinks `wettingCost` of what arrives before holding the rest — so a
 *  thin film cannot advance far, and the front stalls where the offer no
 *  longer covers the cost, which happens first on the ridges. Returns the
 *  water absorbed by the paper this step (the budget spent). */
export function propagateStep(grid: WaterGrid, params: WaterFrontParams = WATER_FRONT_DEFAULT): number {
  const { width, height, paper, water } = grid
  const next = Float64Array.from(water)
  const ring = params.reach === 2 ? [...RING1, ...RING2] : RING1
  let absorbed = 0
  const weights = new Float64Array(ring.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const wi = water[i]
      if (wi <= 0) continue
      const hi = paper[i]
      let total = 0
      for (let k = 0; k < ring.length; k++) {
        const nx = x + ring[k][0], ny = y + ring[k][1]
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) { weights[k] = 0; continue }
        const j = ny * width + nx
        const wj = water[j]
        const drier = Math.max(0, 1 - wj / wi)
        const dist = Math.abs(ring[k][0]) + Math.abs(ring[k][1]) > 2 ? 0.5 : (Math.abs(ring[k][0]) + Math.abs(ring[k][1]) === 2 ? 0.7 : 1)
        const w = drier * dist * Math.exp(params.slope * (hi - paper[j]))
        weights[k] = w
        total += w
      }
      if (total <= 0) continue
      const offer = params.alpha * wi
      next[i] -= offer
      for (let k = 0; k < ring.length; k++) {
        if (weights[k] <= 0) continue
        const nx = x + ring[k][0], ny = y + ring[k][1]
        const j = ny * width + nx
        let give = offer * weights[k] / total
        if (water[j] <= 0) {
          // A dry cell drinks first.
          const drink = Math.min(give, params.wettingCost)
          absorbed += drink
          give -= drink
        }
        next[j] += give
      }
    }
  }
  for (let i = 0; i < next.length; i++) if (next[i] < params.eps) { absorbed += next[i]; next[i] = 0 }
  water.set(next)
  return absorbed
}

export function propagate(grid: WaterGrid, steps: number, params: WaterFrontParams = WATER_FRONT_DEFAULT): number {
  let absorbed = 0
  for (let s = 0; s < steps; s++) absorbed += propagateStep(grid, params)
  return absorbed
}

/** The wet domain: 1 where water stands above eps. */
export function waterDomain(grid: WaterGrid, eps = WATER_FRONT_DEFAULT.eps): Uint8Array {
  const out = new Uint8Array(grid.water.length)
  for (let i = 0; i < out.length; i++) out[i] = grid.water[i] > eps ? 1 : 0
  return out
}

/** The front's radius from (cx, cy) at `count` angles: the last wet cell
 *  along each ray before the first run of `gap` dry cells. */
export function frontProfile(domain: Uint8Array, width: number, height: number, cx: number, cy: number, count = 72, gap = 3): Float64Array {
  const out = new Float64Array(count)
  const maxR = Math.hypot(width, height)
  for (let a = 0; a < count; a++) {
    const t = (a / count) * Math.PI * 2
    const dx = Math.cos(t), dy = Math.sin(t)
    let last = 0, dry = 0
    for (let r = 0; r < maxR; r += 0.5) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r)
      if (x < 0 || y < 0 || x >= width || y >= height) break
      if (domain[y * width + x]) { last = r; dry = 0 } else if (++dry >= gap * 2) break
    }
    out[a] = last
  }
  return out
}

export interface FrontStats {
  mean: number
  std: number
  min: number
  max: number
  /** Local maxima of the radius over the angle after a 3-tap smoothing:
   *  the front's lobes. */
  fingers: number
}

export function frontStats(radii: Float64Array): FrontStats {
  const n = radii.length
  let sum = 0, min = Infinity, max = -Infinity
  for (const r of radii) { sum += r; if (r < min) min = r; if (r > max) max = r }
  const mean = sum / n
  let v = 0
  for (const r of radii) v += (r - mean) ** 2
  const smooth = new Float64Array(n)
  for (let i = 0; i < n; i++) smooth[i] = (radii[(i + n - 1) % n] + radii[i] + radii[(i + 1) % n]) / 3
  let fingers = 0
  for (let i = 0; i < n; i++) if (smooth[i] > smooth[(i + n - 1) % n] && smooth[i] > smooth[(i + 1) % n]) fingers++
  return { mean, std: Math.sqrt(v / n), min, max, fingers }
}

/** Mean paper height on the front (wet cells with a dry 4-neighbour) against
 *  the mean over the domain: below 0 the front sits low, i.e. it has run
 *  along the valleys and stalled short of the ridges. */
export function frontHeightBias(domain: Uint8Array, paper: Float64Array, width: number, height: number): { front: number; domain: number; outside: number } {
  let fs = 0, fn = 0, ds = 0, dn = 0, os = 0, on = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!domain[i]) { os += paper[i]; on++; continue }
      ds += paper[i]; dn++
      const edge = (x > 0 && !domain[i - 1]) || (x < width - 1 && !domain[i + 1]) || (y > 0 && !domain[i - width]) || (y < height - 1 && !domain[i + width])
      if (edge) { fs += paper[i]; fn++ }
    }
  }
  return { front: fn ? fs / fn : 0, domain: dn ? ds / dn : 0, outside: on ? os / on : 0 }
}

// ─── The front as a wetting cost ────────────────────────────────────────────
//
// The fractional propagation above moves the front one cell a step and thins
// the film geometrically, so a drop of radius 30 stalls within four cells
// whatever the paper does (measured: R_front/R_drop 1.07, radius spread 2%,
// against 1.3 and ~20% on the photograph). Water on paper does not spread
// like that: the drop is a reservoir, and how far its film reaches in a
// direction is a matter of how much wetting COST the paper puts in the way —
// cheap along a valley, dear over a ridge. That is a geodesic distance with
// the paper's height as the terrain, and a budget the drop's water pays.
//
//   cost(j) = min over neighbours i of cost(i) + edge(i → j)
//   edge(i → j) = |ij| · max(EDGE_FLOOR, 1 + climb · (h_j − h_i))
//   domain = cost ≤ budget
//
// Relaxed in place a few steps over the 8 neighbours (16 with reach 2): each
// step the front advances up to one ring, so `steps` also caps the reach.
// This is what the GPU port runs: a min over a ring of taps, one pass per
// step, a byte of cost per cell.

export interface WettingCostParams {
  /** Extra cost per unit of height climbed, in cell units: 40 makes a full
   *  0.1 rise cost five cells of flat paper. */
  climb: number
  /** The cheapest an edge gets when falling: keeps valleys from being free. */
  floor: number
  /** How far the water pays for, in cells of flat paper. */
  budget: number
  reach: 1 | 2
}

export const WETTING_COST_DEFAULT: WettingCostParams = { climb: 40, floor: 0.25, budget: 10, reach: 1 }

/** Cost to wet every cell from the drop's footprint (cost 0 inside it), after
 *  `steps` relaxations. Cells never reached hold Infinity. */
export function wettingCost(width: number, height: number, paper: Float64Array, seed: Uint8Array, steps: number, params: WettingCostParams = WETTING_COST_DEFAULT): Float64Array {
  const cost = new Float64Array(width * height).fill(Infinity)
  for (let i = 0; i < cost.length; i++) if (seed[i]) cost[i] = 0
  const ring = params.reach === 2 ? [...RING1, ...RING2] : RING1
  const next = new Float64Array(cost.length)
  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const j = y * width + x
        let best = cost[j]
        if (best === 0) { next[j] = 0; continue }
        const hj = paper[j]
        for (let k = 0; k < ring.length; k++) {
          const nx = x + ring[k][0], ny = y + ring[k][1]
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const i = ny * width + nx
          const ci = cost[i]
          if (ci === Infinity) continue
          const len = Math.hypot(ring[k][0], ring[k][1])
          const edge = len * Math.max(params.floor, 1 + params.climb * (hj - paper[i]))
          const c = ci + edge
          if (c < best) best = c
        }
        next[j] = best
      }
    }
    cost.set(next)
  }
  return cost
}

/** The domain a drop wets: its footprint plus everything within the budget. */
export function wettingDomain(cost: Float64Array, budget: number): Uint8Array {
  const out = new Uint8Array(cost.length)
  for (let i = 0; i < out.length; i++) out[i] = cost[i] <= budget ? 1 : 0
  return out
}

export function discSeed(width: number, height: number, cx: number, cy: number, radius: number): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) out[y * width + x] = 1
  return out
}

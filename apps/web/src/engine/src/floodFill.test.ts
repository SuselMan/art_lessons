import { describe, it, expect } from 'vitest'

import {
  blockedRowSpans, computeFill, coverageToRgba, expandFilled, maskRowSpans, openingOfSoft,
  type FillSource,
} from './floodFill'

const WHITE: readonly [number, number, number] = [255, 255, 255]

/** Builds a premultiplied RGBA source from an ASCII picture, the way the
 *  engine hands one over: `#` is opaque black ink, `.` is untouched paper
 *  (fully transparent), a digit 0-9 is ink at that tenth of coverage — which
 *  is what the rim of every real pencil line actually looks like. */
function source(rows: string[], background = WHITE): FillSource {
  const height = rows.length
  const width = rows[0].length
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x]
      const a = ch === '#' ? 255 : ch === '.' ? 0 : Math.round(Number(ch) / 10 * 255)
      const i = (y * width + x) * 4
      // Premultiplied black ink: rgb stays 0, alpha carries the coverage.
      pixels[i + 3] = a
    }
  }
  return { pixels, width, height, background }
}

const at = (r: { coverage: Uint8Array }, width: number, x: number, y: number) => r.coverage[y * width + x]

const params = (over: Partial<Parameters<typeof computeFill>[1]> = {}) => ({
  seedX: 0, seedY: 0, tolerance: 0.1, gapClose: 0, expand: 0, ...over,
})

describe('computeFill', () => {
  it('fills the inside of a closed shape and nothing outside it', () => {
    const rows = [
      '........',
      '.######.',
      '.#....#.',
      '.#....#.',
      '.######.',
      '........',
    ]
    const src = source(rows)
    const r = computeFill(src, params({ seedX: 3, seedY: 2 }))
    expect(r.bounds).toEqual({ minX: 2, minY: 2, maxX: 6, maxY: 4 })
    expect(at(r, 8, 3, 2)).toBe(255)
    // Outside the box and on the wall itself: untouched.
    expect(at(r, 8, 0, 0)).toBe(0)
    expect(at(r, 8, 1, 1)).toBe(0)
    // A closed region never reaches the domain edge, so nothing to warn about.
    expect(r.clipped).toBe(false)
  })

  // One picture, two runs: a box whose right wall is one pixel short of
  // closing — the shape every pencil outline actually has, since a graphite
  // line is laid through the paper's grain and full of holes.
  const leakyBox = [
    '.........',
    '.#######.',
    '.#.....#.',
    '.#.......',   // the hole
    '.#.....#.',
    '.#######.',
    '.........',
  ]

  it('reports clipped when the outline has a hole, instead of quietly filling everything', () => {
    const r = computeFill(source(leakyBox), params({ seedX: 4, seedY: 3 }))
    expect(r.clipped).toBe(true)
    // It really did leak: the corner of the domain is paint now.
    expect(at(r, 9, 0, 0)).toBe(255)
  })

  it('closes a one-pixel gap so the same outline holds', () => {
    const r = computeFill(source(leakyBox), params({ seedX: 4, seedY: 3, gapClose: 1 }))
    expect(r.clipped).toBe(false)
    expect(at(r, 9, 0, 0)).toBe(0)
    expect(at(r, 9, 4, 3)).toBe(255)
    // And the seal did not cost the region its own corner.
    expect(at(r, 9, 2, 2)).toBe(255)
  })

  it('does not shrink the region it fills when closing gaps', () => {
    // The point of an opening: structures wider than the element come back
    // exactly where they were, so turning gapClose on must not pull the paint
    // away from the walls.
    const rows = [
      '########',
      '#......#',
      '#......#',
      '#......#',
      '########',
    ]
    const plain = computeFill(source(rows), params({ seedX: 4, seedY: 2 }))
    const closed = computeFill(source(rows), params({ seedX: 4, seedY: 2, gapClose: 1 }))
    expect(closed.bounds).toEqual(plain.bounds)
    expect(at(closed, 8, 1, 1)).toBe(255)
  })

  it('steps the radius down rather than refusing a region thinner than it', () => {
    // Two px of air between the walls. A closing at radius 2 deletes it along
    // with the leaks — at that width a room and a corridor are the same shape
    // — so the fill retries weaker instead of quietly doing nothing.
    const rows = [
      '########',
      '#......#',
      '#......#',
      '########',
    ]
    const r = computeFill(source(rows), params({ seedX: 4, seedY: 1, gapClose: 3 }))
    expect(r.bounds).toEqual({ minX: 1, minY: 1, maxX: 7, maxY: 3 })
    expect(r.clipped).toBe(false)
  })

  it('takes the soft edge from the ink, so a feathered line gets partial coverage', () => {
    // A wall whose inner pixel is half-covered graphite: the fill should meet
    // it at roughly half strength rather than stopping a pixel short (a pale
    // seam) or running over it at full strength (a hard step).
    const rows = [
      '#######',
      '#5...5#',
      '#5...5#',
      '#######',
    ]
    const r = computeFill(source(rows), params({ seedX: 3, seedY: 1, tolerance: 0.6 }))
    const soft = at(r, 7, 1, 1)
    expect(soft).toBeGreaterThan(0)
    expect(soft).toBeLessThan(255)
    expect(at(r, 7, 3, 1)).toBe(255)
  })

  it('expand pushes solid paint under the line, leaving no partial rim', () => {
    const rows = [
      '#######',
      '#5...5#',
      '#5...5#',
      '#######',
    ]
    const r = computeFill(source(rows), params({ seedX: 3, seedY: 1, tolerance: 0.6, expand: 1 }))
    // The half-covered pixel is now solid fill, and the paint has reached the
    // opaque wall itself.
    expect(at(r, 7, 1, 1)).toBe(255)
    expect(at(r, 7, 0, 1)).toBe(255)
  })

  it('fills the mark itself when the seed is on ink', () => {
    const rows = [
      '.......',
      '..###..',
      '..###..',
      '.......',
    ]
    const r = computeFill(source(rows), params({ seedX: 3, seedY: 1 }))
    expect(r.bounds).toEqual({ minX: 2, minY: 1, maxX: 5, maxY: 3 })
    expect(at(r, 7, 0, 0)).toBe(0)
  })

  it('separates regions by colour, not only by alpha', () => {
    // Two opaque halves, black and red, no transparent boundary between them:
    // alpha alone cannot tell them apart.
    const width = 6, height = 2
    const pixels = new Uint8Array(width * height * 4)
    for (let p = 0; p < width * height; p++) {
      const i = p * 4
      pixels[i + 3] = 255
      if (p % width >= 3) pixels[i] = 255   // premultiplied red
    }
    const r = computeFill({ pixels, width, height, background: WHITE }, params({ seedX: 0, seedY: 0 }))
    expect(at(r, width, 2, 0)).toBe(255)
    expect(at(r, width, 3, 0)).toBe(0)
  })

  it('compares what is seen, not what is stored: opaque white paint on white paper is not a wall', () => {
    // Stored, these two pixels could not differ more — one is transparent, the
    // other is fully opaque. On screen they are the same white, so the fill has
    // to run straight through. Any comparison keyed on alpha (or on stored RGB,
    // which is meaningless where alpha is zero) stops dead at column 2 instead.
    const width = 5, height = 1
    const pixels = new Uint8Array(width * height * 4)
    for (const x of [2]) {
      const i = x * 4
      pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255
    }
    const r = computeFill({ pixels, width, height, background: WHITE }, params({ seedX: 0, seedY: 0 }))
    expect(at(r, width, 2, 0)).toBe(255)
    expect(at(r, width, 4, 0)).toBe(255)
  })

  it('reads the paper colour, so the same drawing on tinted paper is judged against that tint', () => {
    // 40% black graphite on near-black paper is nearly invisible and should not
    // stop the fill; the same pixel on white paper is a wall. Only the
    // background differs between the two runs.
    const rows = ['.4.']
    const p = params({ seedX: 0, seedY: 0, tolerance: 0.25 })
    expect(at(computeFill(source(rows, [20, 20, 20]), p), 3, 2, 0)).toBe(255)
    expect(at(computeFill(source(rows, WHITE), p), 3, 2, 0)).toBe(0)
  })

  it('refuses a seed outside the domain rather than filling from the edge', () => {
    const r = computeFill(source(['....', '....']), params({ seedX: 9, seedY: 0 }))
    expect(r.bounds).toBeNull()
    expect(r.coverage.length).toBe(0)
  })

  it('fills a region far larger than any call stack', () => {
    // 400x400 of blank paper: a per-pixel recursive fill dies here, which is
    // the entire reason the fill is span-based.
    const width = 400, height = 400
    const src: FillSource = {
      pixels: new Uint8Array(width * height * 4), width, height, background: WHITE,
    }
    const r = computeFill(src, params({ seedX: 200, seedY: 200 }))
    expect(r.bounds).toEqual({ minX: 0, minY: 0, maxX: width, maxY: height })
    expect(r.clipped).toBe(true)
  })
})

describe('openingOfSoft', () => {
  // The production opening is sparse: it works the *blocked* side of the field
  // and touches only rows that hold ink, which is what makes its cost scale
  // with the drawing rather than with the canvas. That is an optimisation with
  // a real argument behind it (see its docstring) and therefore exactly the
  // kind of thing that can be subtly wrong at an edge nobody pictured. So the
  // plain, obviously-correct version it replaced lives on here, and the two are
  // held against each other on random fields.

  /** Separable box dilation (`isMax`) or erosion — the textbook form, dense,
   *  every pixel, no cleverness. Slow and plainly right. */
  function densePass(field: Uint8Array, width: number, height: number, r: number, isMax: boolean): void {
    if (r <= 0) return
    const src = field.slice()
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = src[y * width + x]
        for (let ny = Math.max(0, y - r); ny <= Math.min(height - 1, y + r); ny++) {
          for (let nx = Math.max(0, x - r); nx <= Math.min(width - 1, x + r); nx++) {
            const c = src[ny * width + nx]
            if (isMax ? c > v : c < v) v = c
          }
        }
        field[y * width + x] = v
      }
    }
  }

  function denseOpening(soft: Uint8Array, width: number, height: number, r: number): Uint8Array {
    const out = soft.slice()
    densePass(out, width, height, r, false)
    densePass(out, width, height, r, true)
    return out
  }

  /** Deterministic pseudo-random field, mostly 255 (paper) with scattered ink
   *  of varying strength — the shape of a real classification result. */
  function randomSoft(width: number, height: number, seed: number, inkRate: number): Uint8Array {
    const out = new Uint8Array(width * height).fill(255)
    let s = seed
    const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let p = 0; p < out.length; p++) if (next() < inkRate) out[p] = Math.floor(next() * 255)
    return out
  }

  it('matches a plain dense opening, pixel for pixel', () => {
    for (const r of [1, 2, 3]) {
      for (const inkRate of [0.02, 0.2, 0.6]) {
        const width = 37, height = 23   // deliberately not round, and not square
        const soft = randomSoft(width, height, 7 + r * 31 + Math.round(inkRate * 100), inkRate)
        const sparse = openingOfSoft(soft, width, height, r, blockedRowSpans(soft, width, height))
        expect(Array.from(sparse), `r=${r} ink=${inkRate}`)
          .toEqual(Array.from(denseOpening(soft, width, height, r)))
      }
    }
  })

  it('matches the dense version on a field with no ink at all', () => {
    // The sparse form visits no rows here, so it has to be right by
    // construction rather than by having run — worth pinning.
    const soft = new Uint8Array(20 * 10).fill(255)
    const sparse = openingOfSoft(soft, 20, 10, 2, blockedRowSpans(soft, 20, 10))
    expect(Array.from(sparse)).toEqual(Array.from(denseOpening(soft, 20, 10, 2)))
  })

  it('matches the dense version when the ink runs along the domain edges', () => {
    // Clamping at the border is where a window-stamping form and a
    // window-reading form disagree if either gets its bounds wrong.
    const width = 16, height = 12
    const soft = new Uint8Array(width * height).fill(255)
    for (let x = 0; x < width; x++) { soft[x] = 0; soft[(height - 1) * width + x] = 30 }
    for (let y = 0; y < height; y++) { soft[y * width] = 90; soft[y * width + width - 1] = 0 }
    for (const r of [1, 2, 3]) {
      const sparse = openingOfSoft(soft, width, height, r, blockedRowSpans(soft, width, height))
      expect(Array.from(sparse), `r=${r}`).toEqual(Array.from(denseOpening(soft, width, height, r)))
    }
  })
})

describe('expandFilled', () => {
  // Same deal as the opening above: the production version is separable,
  // sweep-based and bounded by the region's own row extents, which is three
  // chances to be subtly wrong at an edge. Held against the definition.

  /** Dilation straight from the definition: a pixel is set if any pixel within
   *  Chebyshev distance r of it is set. */
  function denseDilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
    const out = new Uint8Array(mask.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let ny = Math.max(0, y - r); ny <= Math.min(height - 1, y + r); ny++) {
          for (let nx = Math.max(0, x - r); nx <= Math.min(width - 1, x + r); nx++) {
            if (mask[ny * width + nx] !== 0) { out[y * width + x] = 1; ny = height; break }
          }
        }
      }
    }
    return out
  }

  function randomMask(width: number, height: number, seed: number, rate: number): Uint8Array {
    const out = new Uint8Array(width * height)
    let s = seed
    const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let p = 0; p < out.length; p++) if (next() < rate) out[p] = 1
    return out
  }

  it('matches the definition on random masks, including at the domain edges', () => {
    for (const r of [1, 2, 3]) {
      for (const rate of [0.01, 0.3, 0.9]) {
        const width = 29, height = 19
        const mask = randomMask(width, height, 3 + r * 17 + Math.round(rate * 100), rate)
        const mine = mask.slice()
        expandFilled(mine, width, height, r, maskRowSpans(mask, width, height))
        expect(Array.from(mine), `r=${r} rate=${rate}`)
          .toEqual(Array.from(denseDilate(mask, width, height, r)))
      }
    }
  })

  it('reaches a diagonal neighbour, not just the four sides', () => {
    // A four-connected dilation would leave the corners of the 3x3 empty; a
    // square element fills them, and every downstream pixel count depends on
    // which of the two this is.
    const mask = new Uint8Array(25)
    mask[12] = 1
    expandFilled(mask, 5, 5, 1, maskRowSpans(mask, 5, 5))
    expect(Array.from(mask.slice(6, 9))).toEqual([1, 1, 1])
    expect(Array.from(mask.slice(16, 19))).toEqual([1, 1, 1])
  })

  it('grows the region spans it was given, so later steps see the new pixels', () => {
    // The spans are what bounds the coverage pass afterwards — leave them
    // un-grown and the expansion is computed and then cropped back off.
    const mask = new Uint8Array(25)
    mask[12] = 1
    const spans = maskRowSpans(mask, 5, 5)
    expandFilled(mask, 5, 5, 1, spans)
    expect([spans.lo[1], spans.hi[1]]).toEqual([1, 3])
    expect([spans.lo[3], spans.hi[3]]).toEqual([1, 3])
  })
})

describe('coverageToRgba', () => {
  it('crops to the bounds and carries the colour flat across the rect', () => {
    const coverage = new Uint8Array(16)
    coverage[5] = 255      // (1,1)
    coverage[6] = 128      // (2,1)
    const out = coverageToRgba(coverage, 4, { minX: 1, minY: 1, maxX: 3, maxY: 2 }, [10, 20, 30])
    expect(out.width).toBe(2)
    expect(out.height).toBe(1)
    expect(Array.from(out.pixels)).toEqual([10, 20, 30, 255, 10, 20, 30, 128])
  })

  it('keeps the colour on fully transparent pixels too', () => {
    // Straight alpha, and a flat RGB plane is what makes the PNG small — a
    // transparent pixel that also zeroed the colour would break both.
    const coverage = new Uint8Array(4)
    const out = coverageToRgba(coverage, 2, { minX: 0, minY: 0, maxX: 2, maxY: 2 }, [7, 8, 9])
    expect(Array.from(out.pixels.slice(0, 4))).toEqual([7, 8, 9, 0])
  })
})

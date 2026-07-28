/// <reference types="node" />
// This file (unlike every other test in this app-typechecked src/ tree) runs
// against the real filesystem — it reads the actual baked public/paper/*
// assets — so it needs Node's ambient types explicitly: tsconfig.app.json's
// own `types` is deliberately DOM/browser-only (`["vite/client"]`, no
// "node"), so browser-reachable app code can't accidentally reference a
// Node-only API without TS catching it. This reference is scoped to just
// this one file.
//
// Checks the baked paper assets themselves, not the code that made them.
//
// Replaces the byte-for-byte comparison against the procedural generator that
// used to live in paperNoise.test.ts: with the grain now baked from a
// photographed sheet (#333) there is no formula to recompute, so what's left
// to assert is what a bad bake would actually look like on a canvas.
//
// The continuity check is the one #302 wished existed. Its bug was a hard
// vertical line *inside* the tile, and every seamlessness test at the time
// compared h(x) with h(x + period) — invariance under a full-period shift,
// which a mid-tile discontinuity passes perfectly, because both sampled
// points move together. Nothing looked at neighbouring columns.
import { gunzipSync } from 'node:zlib'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PAPER_GRAIN_TYPES } from '@grafetto/shared'

import { PAPER_BAKE_RESOLUTION } from './paperConstants'

const RES = PAPER_BAKE_RESOLUTION
const paperDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public/paper')

// The bake is a prebuild step and its output is gitignored, so a clean
// checkout that has not built yet legitimately has nothing to check.
const baked = existsSync(join(paperDir, `${PAPER_GRAIN_TYPES[0]}.paper`))

// Measured across the three shipped papers: worst neighbouring-column jump
// runs 6.5 to 11.9 levels. #302's procedural seam was 24 to 34 against a
// typical 1 to 2, and was plainly visible on a blank canvas. 16 sits between
// the two — high enough not to flag the soft residue of the sheet's own
// cross-faded edges, low enough that a hard seam cannot slip back in.
const MAX_MEAN_JUMP = 16

describe.skipIf(!baked)('baked paper assets', () => {
  for (const type of PAPER_GRAIN_TYPES) {
    const bytes = baked ? gunzipSync(readFileSync(join(paperDir, `${type}.paper`))) : new Uint8Array()

    it(`${type}: is an interleaved LUMINANCE_ALPHA grid of exactly PAPER_BAKE_RESOLUTION²`, () => {
      // uploadPaperTexture derives the texture's dimensions from this length;
      // a wrong count is a GL error at runtime, not a stretched image.
      expect(bytes.length).toBe(RES * RES * 2)
    })

    it(`${type}: has a preview for the picker`, () => {
      expect(existsSync(join(paperDir, `${type}.preview`))).toBe(true)
    })

    it(`${type}: has no hard discontinuity between neighbouring columns or rows, wrap included`, () => {
      const cols = new Float64Array(RES)
      const rows = new Float64Array(RES)
      for (let y = 0; y < RES; y++) {
        for (let x = 0; x < RES; x++) {
          const h = bytes[(y * RES + x) * 2]
          cols[x] += h / RES
          rows[y] += h / RES
        }
      }
      // Column/row means rather than individual texels: grain is noise, so
      // neighbouring texels differ wildly by design. Averaging a whole line
      // leaves only structure, which is exactly what a seam is. Indices wrap,
      // so the tile's own edge is tested by the same rule as its middle —
      // a seam there would tile into a visible grid.
      const worst = (a: Float64Array) => {
        let max = 0
        for (let i = 0; i < RES; i++) max = Math.max(max, Math.abs(a[(i + 1) % RES] - a[i]))
        return max
      }
      expect(worst(cols)).toBeLessThan(MAX_MEAN_JUMP)
      expect(worst(rows)).toBeLessThan(MAX_MEAN_JUMP)
    })
  }
})

/// <reference types="node" />
// This file (unlike every other test in this app-typechecked src/ tree) runs
// against the real filesystem — it reads the actual committed
// public/paper/*.paper assets (see the "committed baked assets" suite
// below) — so it needs Node's ambient types explicitly: tsconfig.app.json's
// own `types` is deliberately DOM/browser-only (`["vite/client"]`, no
// "node"), so browser-reachable app code can't accidentally reference a
// Node-only API without TS catching it. This reference is scoped to just
// this one file.
//
// #141 follow-up: making the paper texture GL_REPEAT-wrapped only wraps the
// *sample coordinate* — it does nothing to make the underlying noise
// (hash/vnoise/fbm) itself periodic over any domain, so a repeated texture
// still showed a hard seam every time it tiled (measured: up to a ~0.26
// jump in the 0..1 height value at the wrap boundary for the
// rough/1024px/scale=580 case). Fixed by snapping each fbm octave's
// frequency to an integer cell count and wrapping vnoise's own grid-index
// lookups by that count (see paperNoise.ts's seamlessRatio/vnoise/fbm) so
// the noise is *exactly* periodic over the texture's own size once
// `seamless` is on.
//
// This algorithm is now baked offline (see ../../../scripts/
// bakePaperTextures.ts), not evaluated live in a shader, so these tests
// import straight from paperNoise.ts instead of hand-duplicating the math —
// a single source of truth shared with the bake script itself.
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { PaperType } from '@art-lessons/shared'

import {
  PAPER_BAKE_RESOLUTION, PAPER_GRAIN_CONFIGS, PAPER_ROUGHNESS, paperCatchValue, paperHeight,
  paperCatchValueForRoughVariant, paperHeightForRoughVariant, SHIPPED_ROUGH_VARIANT_INDEX,
} from './paperNoise'

const RES = PAPER_BAKE_RESOLUTION

// Sample points spread across the texture, including ones deliberately
// close to 0/RES (where a wrap-related bug would be most likely to hide)
// and a couple of interior points for good measure.
const SAMPLE_POINTS: Array<[number, number]> = [
  [0.5, 0.5], [300.5, 700.5], [RES - 0.5, 50.5], [RES / 2 + 0.5, RES / 2 + 0.5], [777.5, 333.5],
]

describe('paper noise seamlessness (#141 follow-up)', () => {
  describe('seamless (baked-tile) mode is exactly periodic', () => {
    for (const [name, cfg] of Object.entries(PAPER_GRAIN_CONFIGS)) {
      // Tolerance is float rounding, not a real seam — the exact-integer
      // period argument seamlessRatio hands to vnoise (fN*basePeriod) is
      // itself the product of two floats (a floor()'d division, then
      // re-multiplied), so it isn't always bit-identical to a true integer;
      // at PAPER_BAKE_RESOLUTION (2048, vs. the 1024 this fix was
      // originally measured at) that rounding compounds slightly more.
      // Measured max across configs/sample points at RES=2048 is ~2e-5 —
      // this keeps a full order of magnitude of headroom above that while
      // staying two orders of magnitude below 1/255 (~0.0039), the
      // smallest change an 8-bit-quantized bake could even represent.
      it(`${name}: height is invariant under a full-period shift in X`, () => {
        for (const [x, y] of SAMPLE_POINTS) {
          const h1 = paperHeight(x, y, RES, RES, cfg, true)
          const h2 = paperHeight(x + RES, y, RES, RES, cfg, true)
          expect(Math.abs(h1 - h2)).toBeLessThan(1e-4)
        }
      })

      it(`${name}: height is invariant under a full-period shift in Y and under a 2x period shift`, () => {
        const [x, y] = [100.5, 400.5]
        const base = paperHeight(x, y, RES, RES, cfg, true)
        const yShift = paperHeight(x, y + RES, RES, RES, cfg, true)
        const xShift2 = paperHeight(x + 2 * RES, y, RES, RES, cfg, true)
        expect(Math.abs(base - yShift)).toBeLessThan(1e-4)
        expect(Math.abs(base - xShift2)).toBeLessThan(1e-4)
      })
    }
  })

  // The reviewer's own numeric check (before this fix landed) compared the
  // height at the texture's leftmost column to its rightmost column, same
  // row, and found a hard jump (up to 0.26 in the 0..1 range). That's the
  // *visible* symptom, but it isn't a reliable pass/fail metric on its own:
  // column 0 and column RES-1 are only RES-1 apart, one pixel short of a
  // true full period, so even a correctly-fixed texture can show a
  // non-tiny left/right diff there — this noise's contrast curve
  // (pow(h, 1/contrast)) amplifies ordinary adjacent-pixel variation enough
  // that "near zero" isn't a safe absolute threshold, and that variation is
  // noisy enough that even the *relative* (seamless vs non-seamless) gap
  // doesn't reliably shrink at every single row — some individual rows can
  // go either way. What IS reliable, and asserted above, is exact
  // invariance under a true full-period shift; this test instead checks
  // the *aggregate* (averaged over many rows) left/right gap shrinks,
  // which is what actually corresponds to "fewer visible wrap seams
  // overall" and is stable across both PAPER_BAKE_RESOLUTION values this
  // fix has been measured at (1024 originally, 2048 now).
  it('seamless mode narrows the average left-column/right-column gap the reviewer measured', () => {
    const rows = Array.from({ length: 11 }, (_, i) => Math.floor((i / 10) * (RES - 1)))
    for (const [name, cfg] of Object.entries(PAPER_GRAIN_CONFIGS)) {
      let sumOld = 0, sumNew = 0
      for (const row of rows) {
        const leftOld  = paperHeight(0.5, row + 0.5, RES, RES, cfg, false)
        const rightOld = paperHeight(RES - 0.5, row + 0.5, RES, RES, cfg, false)
        const leftNew  = paperHeight(0.5, row + 0.5, RES, RES, cfg, true)
        const rightNew = paperHeight(RES - 0.5, row + 0.5, RES, RES, cfg, true)
        sumOld += Math.abs(leftOld - rightOld)
        sumNew += Math.abs(leftNew - rightNew)
      }
      expect(sumNew / rows.length, `${name}: average diff should shrink`).toBeLessThan(sumOld / rows.length)
    }
  })

  it('non-seamless mode is NOT periodic — demonstrates the bug this fix targets', () => {
    // A texture that already happened to be exactly periodic wouldn't need
    // fixing — this confirms the *un-fixed* formula genuinely has the seam
    // (a real, non-negligible mismatch a full period apart), so the
    // periodicity asserted above is this fix actually doing something, not
    // a property the noise already had for free.
    const cfg = PAPER_GRAIN_CONFIGS.rough
    let maxDiff = 0
    for (const [x, y] of SAMPLE_POINTS) {
      const h1 = paperHeight(x, y, RES, RES, cfg, false)
      const h2 = paperHeight(x + RES, y, RES, RES, cfg, false)
      maxDiff = Math.max(maxDiff, Math.abs(h1 - h2))
    }
    expect(maxDiff).toBeGreaterThan(0.01)
  })
})

// ─── Committed baked assets ────────────────────────────────────────────────
//
// The tests above prove the *algorithm* is periodic in the abstract. They
// can't catch "someone re-ran the bake with different PAPER_GRAIN_CONFIGS
// (or a different PAPER_BAKE_RESOLUTION) and forgot to re-run `npm run
// bake:paper` and commit the result" — the checked-in public/paper/*.paper
// files would then quietly disagree with what the current source would
// produce. This suite reads the actual committed files and cross-checks a
// handful of decoded bytes against paperHeight() computed fresh from the
// current config, which transitively also confirms the asset was baked
// with seamless=true (a non-seamless bake would fail this at the sample
// points nearest x=0/y=0, same reasoning as the periodicity tests above).

const PAPER_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../public/paper')

function readBakedAsset(type: PaperType): Uint8Array {
  const compressed = readFileSync(join(PAPER_DIR, `${type}.paper`))
  return new Uint8Array(gunzipSync(compressed))
}

describe('committed public/paper/*.paper assets', () => {
  for (const [name, cfg] of Object.entries(PAPER_GRAIN_CONFIGS)) {
    const roughness = PAPER_ROUGHNESS[name as PaperType]

    it(`${name}: decompresses to exactly PAPER_BAKE_RESOLUTION^2 interleaved LUMINANCE_ALPHA pairs`, () => {
      const bytes = readBakedAsset(name as PaperType)
      expect(bytes.length).toBe(RES * RES * 2)
    })

    it(`${name}: sampled height (R) and catch (A) bytes match paperNoise.ts recomputed from the current config`, () => {
      // rough ships a ROUGH_VARIANTS candidate (see bakePaperTextures.ts and
      // SHIPPED_ROUGH_VARIANT_INDEX's own comment), not the generic
      // paperHeight/paperCatchValue+cfg formula smooth/bristol still use.
      const bytes = readBakedAsset(name as PaperType)
      for (const [x, y] of SAMPLE_POINTS) {
        const px = Math.floor(x)
        const py = Math.floor(y)
        const idx = (py * RES + px) * 2
        const expectedHeight = name === 'rough'
          ? Math.round(paperHeightForRoughVariant(px + 0.5, py + 0.5, RES, RES, SHIPPED_ROUGH_VARIANT_INDEX) * 255)
          : Math.round(paperHeight(px + 0.5, py + 0.5, RES, RES, cfg, true) * 255)
        const expectedCatch = name === 'rough'
          ? Math.round(paperCatchValueForRoughVariant(px + 0.5, py + 0.5, RES, RES, SHIPPED_ROUGH_VARIANT_INDEX) * 255)
          : Math.round(paperCatchValue(px + 0.5, py + 0.5, RES, RES, cfg, roughness) * 255)
        expect(Math.abs(bytes[idx] - expectedHeight)).toBeLessThanOrEqual(1)
        expect(Math.abs(bytes[idx + 1] - expectedCatch)).toBeLessThanOrEqual(1)
      }
    })
  }
})

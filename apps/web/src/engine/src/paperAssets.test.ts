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
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PAPER_GRAIN_TYPES } from '@grafetto/shared'

import { buildPaperCatch } from './paperCatch'
import { PAPER_BAKE_RESOLUTION } from './paperConstants'
import { PAPER_MANIFEST_FILENAME, parsePaperManifest, type PaperManifest } from './paperManifest'

const RES = PAPER_BAKE_RESOLUTION
const paperDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public/paper')

// The bake is a prebuild step and its output is gitignored, so a clean
// checkout that has not built yet legitimately has nothing to check.
//
// (#322) Probing the manifest rather than a fixed `coarse.paper`, because
// with content-hashed names there is no longer a filename this test could
// guess. The manifest is also the stricter probe: it is written last and only
// on a complete bake (see bakePaperTextures.ts), so its presence means the
// three papers are all there, not just the first one.
const manifestPath = join(paperDir, PAPER_MANIFEST_FILENAME)
let manifest: PaperManifest | null = null
if (existsSync(manifestPath)) {
  // Deliberately not wrapped in a try: a manifest that exists but does not
  // parse is a broken bake, not an unbuilt checkout, and the two must not
  // collapse into the same silent skip. Letting it throw during collection
  // fails the run loudly, which is the only signal that would ever reach
  // anyone — nothing else in CI reads these files.
  manifest = parsePaperManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), manifestPath)
}
const baked = manifest !== null

// Measured across the three shipped papers: worst neighbouring-column jump
// runs 6.5 to 11.9 levels. #302's procedural seam was 24 to 34 against a
// typical 1 to 2, and was plainly visible on a blank canvas. 16 sits between
// the two — high enough not to flag the soft residue of the sheet's own
// cross-faded edges, low enough that a hard seam cannot slip back in.
const MAX_MEAN_JUMP = 16

describe.skipIf(!baked)('baked paper assets', () => {
  // The invariant paperLoader.ts leans on at runtime: it looks a type up in
  // the manifest and fetches whatever it finds, with no fallback. A name that
  // points at nothing is a 404, and a 404 leaves _paperTexLoaded false, which
  // disables drawing for the whole room without an error anywhere near it.
  it('manifest names a file that exists for every paper type, and no others', () => {
    expect(Object.keys(manifest!.assets).sort()).toEqual([...PAPER_GRAIN_TYPES].sort())
    for (const type of PAPER_GRAIN_TYPES) {
      const entry = manifest!.assets[type]
      expect(existsSync(join(paperDir, entry.texture)), entry.texture).toBe(true)
      expect(existsSync(join(paperDir, entry.preview)), entry.preview).toBe(true)
    }
  })

  for (const type of PAPER_GRAIN_TYPES) {
    // Read at collection time, outside any `it`, so `skipIf` does not protect
    // it — hence the guard, same reason it was here before hashing.
    const bytes = baked ? gunzipSync(readFileSync(join(paperDir, manifest!.assets[type].texture))) : new Uint8Array()

    it(`${type}: is a bare height plane of exactly PAPER_BAKE_RESOLUTION²`, () => {
      // (#441) One byte per texel, not two — the catch channel is rebuilt on
      // load rather than shipped (see paperCatch.ts). buildPaperCatch and
      // uploadPaperTexture both derive the texture's dimensions from a length,
      // so a wrong count is a GL error at runtime, not a stretched image.
      expect(bytes.length).toBe(RES * RES)
    })

    it(`${type}: rebuilds into a catch channel with real tooth`, () => {
      // (#441) The one thing that can go wrong quietly. A catchLut of zeros —
      // or of anything too flat — still parses, still interleaves, still
      // uploads, and still renders paper that *looks* right, because the tint
      // comes from the height channel. What it loses is the graphite response,
      // i.e. every stroke in the app goes evenly grey. Nothing else in the
      // suite would notice.
      //
      // The three shipped papers measure 97.9 to 101.8 levels of standard
      // deviation. 40 is far below any of them and far above what a degenerate
      // table could produce, so this catches the failure without becoming a
      // tuning tripwire.
      const interleaved = buildPaperCatch(bytes, manifest!.assets[type].catchLut)
      expect(interleaved.length).toBe(RES * RES * 2)

      let sum = 0, sumSq = 0
      for (let i = 0; i < RES * RES; i++) {
        const c = interleaved[i * 2 + 1]
        sum += c
        sumSq += c * c
      }
      const mean = sum / (RES * RES)
      expect(Math.sqrt(sumSq / (RES * RES) - mean * mean)).toBeGreaterThan(40)
    })

    it(`${type}: is named after its own content`, () => {
      // (#322) The hash is what makes an `immutable` cache safe: if it were
      // ever computed over something other than the bytes it names — the
      // gzip stream, say, or a stale buffer — two different grains could
      // share a URL, and a client that cached the first would never see the
      // second. Recomputed here from the file itself rather than trusted.
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
      expect(manifest!.assets[type].texture).toBe(`${type}.${hash}.paper`)
    })

    it(`${type}: manifest records the on-the-wire size of both files`, () => {
      // Not decorative: this is what the `--if-missing` prebuild check
      // compares against to spot a truncated or half-restored CI cache, and
      // what a download-progress readout would have to count against.
      expect(statSync(join(paperDir, manifest!.assets[type].texture)).size).toBe(manifest!.assets[type].textureBytes)
      expect(statSync(join(paperDir, manifest!.assets[type].preview)).size).toBe(manifest!.assets[type].previewBytes)
    })

    it(`${type}: has no hard discontinuity between neighbouring columns or rows, wrap included`, () => {
      const cols = new Float64Array(RES)
      const rows = new Float64Array(RES)
      for (let y = 0; y < RES; y++) {
        for (let x = 0; x < RES; x++) {
          const h = bytes[y * RES + x]
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

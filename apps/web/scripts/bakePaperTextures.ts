// Offline bake of every paper in the grid (#300). For each grain type it
// computes two values per texel on the CPU (see ../src/engine/src/paperNoise.ts)
// — the raw height (for the blank-paper background tint) and the already-
// amplified graphite-catch response (for the stroke itself, see
// paperCatchValue's own comment on why this moved off the GPU) — and writes
// them interleaved as a gzip-compressed LUMINANCE_ALPHA byte grid to
// public/paper/, which every client then fetches and loads identically (raw
// bytes, no <img>/texImage2D-from-image-element decode step, so there is no
// browser-side image-decode/color-management pipeline left to diverge across
// devices — see paperLoader.ts). Baking here, once, replaces #141's
// live-per-client GPU bake (each client rendering its own copy of the same
// shader was the actual source of the cross-device drift this whole redesign
// exists to fix).
//
// It also writes a small `.preview` per type for the paper picker.
//
// (#300) Output is NOT committed any more. The bake is byte-reproducible
// (verified: re-running it left `git status` clean), so CI regenerates it on
// every build and the ~65 MB of binary blobs the grid would otherwise add to
// git history — permanently, and again on every re-tune — never enter the
// repository at all. Run locally with `npm run bake:paper` when iterating on
// the noise.
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PAPER_GRAIN_TYPES } from '@grafetto/shared'

import {
  PAPER_BAKE_RESOLUTION, paperDisplayHeight, paperGridCatch, paperGridHeight,
} from '../src/engine/src/paperNoise.js'

import { writePaperAsset } from './paperAssetIO.js'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public/paper')
mkdirSync(outDir, { recursive: true })

// `--if-missing` is what makes this safe to hang off `prebuild`: a full bake
// is ~3.5 minutes, far too long to pay on every `npm run build`. CI caches
// public/paper keyed on a hash of the noise source, so on a cache hit the
// files are already there and this exits immediately; only a real change to
// the generator costs the bake. Running the script directly (npm run
// bake:paper) always re-bakes, which is what you want while tuning.
const skipIfPresent = process.argv.includes('--if-missing')
const expected = PAPER_GRAIN_TYPES.flatMap(t => [`${t}.paper`, `${t}.preview`])

if (skipIfPresent && expected.every(f => existsSync(join(outDir, f)))) {
  console.log(`paper: ${PAPER_GRAIN_TYPES.length} textures already baked, skipping`)
  process.exit(0)
}

const res = PAPER_BAKE_RESOLUTION

for (const type of PAPER_GRAIN_TYPES) {
  const height = new Float64Array(res * res)
  const catchGrid = new Float64Array(res * res)

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      // `.r` is the display curve, `.a` the raw-height-derived catch — see
      // paperDisplayHeight on why only one of them is remapped.
      const i = y * res + x
      height[i] = paperDisplayHeight(type, paperGridHeight(type, x + 0.5, y + 0.5, res, res))
      catchGrid[i] = paperGridCatch(type, x + 0.5, y + 0.5, res, res)
    }
  }

  writePaperAsset(outDir, type, height, catchGrid, res)
}

console.log(`\n${PAPER_GRAIN_TYPES.length} papers baked into ${outDir}`)
console.log("('flat' needs no asset at all — it has no grain to bake.)")

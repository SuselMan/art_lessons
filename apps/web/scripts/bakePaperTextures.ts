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
import { gzipSync } from 'node:zlib'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PAPER_GRAIN_TYPES } from '@art-lessons/shared'

import {
  PAPER_BAKE_RESOLUTION, PAPER_WORLD_SIZE, paperGridCatch, paperGridHeight,
} from '../src/engine/src/paperNoise.js'

// The picker has to show paper the way the canvas does, which means sampling
// it at the same texel-per-pixel ratio the canvas uses — not the whole tile
// squeezed into a thumbnail. At 100% zoom one tile spans PAPER_WORLD_SIZE
// (157) screen pixels while holding PAPER_BAKE_RESOLUTION (2048) texels, so
// one screen pixel covers ~13 texels. Shrinking the tile to fit a thumbnail
// instead would show a frequency the user never actually sees, and every
// coarseness would look nearly the same in the picker.
const PREVIEW_RESOLUTION = 256

// ...but sampled at true canvas frequency the nine grain types were
// indistinguishable in a 100px card — tried it, every one of them read as
// flat beige. At ~13 texels per preview pixel the box filter averages the
// grain away, which is exactly what the eye sees on a full canvas and
// exactly what makes a picker useless. Magnifying 4x is the honest
// compromise every drawing app makes: the *pattern* becomes legible while
// the *contrast* stays truthful, because the tint formula is unchanged.
// 8 is close to the practical ceiling: at this magnification one preview
// pixel covers ~1.6 texels, so pushing further stops revealing detail and
// starts interpolating texels that aren't there. 4 was legible but still
// too polite to choose by.
const PREVIEW_MAGNIFICATION = 8
const TEXELS_PER_PREVIEW_PIXEL = PAPER_BAKE_RESOLUTION / PAPER_WORLD_SIZE / PREVIEW_MAGNIFICATION

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public/paper')
mkdirSync(outDir, { recursive: true })

/** Box-averages the full-resolution height grid down to preview size. The
 *  averaging is what makes it an honest miniature rather than an aliased
 *  point-sample: at ~13 texels per preview pixel, picking a single texel
 *  turns the grain into moiré that looks nothing like the real surface.
 *  Wraps, since the tile is seamless and the preview spans more than one
 *  repeat. */
function downsampleToPreview(height: Float32Array, res: number): Uint8Array {
  const out = new Uint8Array(PREVIEW_RESOLUTION * PREVIEW_RESOLUTION)
  const block = Math.max(1, Math.round(TEXELS_PER_PREVIEW_PIXEL))
  for (let py = 0; py < PREVIEW_RESOLUTION; py++) {
    for (let px = 0; px < PREVIEW_RESOLUTION; px++) {
      const tx0 = Math.round(px * TEXELS_PER_PREVIEW_PIXEL)
      const ty0 = Math.round(py * TEXELS_PER_PREVIEW_PIXEL)
      let sum = 0
      for (let dy = 0; dy < block; dy++) {
        const ty = (ty0 + dy) % res
        for (let dx = 0; dx < block; dx++) sum += height[ty * res + ((tx0 + dx) % res)]
      }
      out[py * PREVIEW_RESOLUTION + px] = Math.round((sum / (block * block)) * 255)
    }
  }
  return out
}

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
const kib = (n: number) => `${Math.round(n / 1024)} KiB`

for (const type of PAPER_GRAIN_TYPES) {
  // Interleaved LUMINANCE_ALPHA: [height0, catch0, height1, catch1, ...] —
  // matches gl.texImage2D(..., gl.LUMINANCE_ALPHA, ...)'s expected layout
  // (see paperLoader.ts's uploadPaperTexture) and what texture2D(...).r / .a
  // read back in DISPLAY_FRAG/PAPER_BLEND_FRAG (height) and DAB_FRAG (catch).
  const bytes = new Uint8Array(res * res * 2)
  const height = new Float32Array(res * res)

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const h = paperGridHeight(type, x + 0.5, y + 0.5, res, res)
      const catchV = paperGridCatch(type, x + 0.5, y + 0.5, res, res)
      const i = y * res + x
      height[i] = h
      bytes[i * 2] = Math.round(h * 255)
      bytes[i * 2 + 1] = Math.round(catchV * 255)
    }
  }

  // Extension is deliberately NOT `.gz` (or any other extension a static file
  // server might special-case): some servers (Vite's own dev server included
  // — confirmed by hand) auto-tag a `.gz` file with `Content-Encoding: gzip`,
  // which makes the *browser itself* transparently decompress it before
  // paperLoader.ts's fetch() ever sees the bytes, silently breaking its own
  // explicit DecompressionStream('gzip') step. An unrecognized extension
  // guarantees no server has a reason to reinterpret the payload.
  const compressed = gzipSync(bytes, { level: 9 })
  writeFileSync(join(outDir, `${type}.paper`), compressed)

  const preview = gzipSync(downsampleToPreview(height, res), { level: 9 })
  writeFileSync(join(outDir, `${type}.preview`), preview)

  console.log(`${type}: ${kib(bytes.byteLength)} -> ${kib(compressed.byteLength)} texture, ${kib(preview.byteLength)} preview`)
}

console.log(`\n${PAPER_GRAIN_TYPES.length} papers baked into ${outDir}`)
console.log("('flat' needs no asset at all — it has no grain to bake.)")

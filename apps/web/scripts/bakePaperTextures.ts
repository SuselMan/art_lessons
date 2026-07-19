// One-time, developer-run offline bake: computes, for each PaperType, two
// values per texel on the CPU (see ../src/engine/src/paperNoise.ts) — the
// raw height (for the blank-paper background tint) and the already-
// amplified graphite-catch response (for the stroke itself, see
// paperCatchValue's own comment on why this moved off the GPU) — and
// writes them interleaved as a gzip-compressed LUMINANCE_ALPHA byte grid to
// public/paper/, which every client then fetches and loads identically (raw
// bytes, no <img>/texImage2D-from-image-element decode step, so there is no
// browser-side image-decode/color-management pipeline left to diverge
// across devices — see paperLoader.ts). Baking here, once, replaces #141's
// live-per-client GPU bake (each client rendering its own copy of the same
// shader was the actual source of the cross-device drift this whole
// redesign exists to fix).
//
// Run via `npm run bake:paper` (apps/web). Re-run and re-commit the
// resulting .paper files whenever PAPER_GRAIN_CONFIGS, PAPER_ROUGHNESS, or
// PAPER_BAKE_RESOLUTION changes — paperNoise.test.ts's "committed assets"
// suite fails loudly if the checked-in files drift from what the current
// config would produce.
import { gzipSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PaperType } from '@art-lessons/shared'

import {
  PAPER_BAKE_RESOLUTION, PAPER_GRAIN_CONFIGS, PAPER_ROUGHNESS, paperCatchValue, paperHeight,
  paperCatchValueForRoughVariant, paperHeightForRoughVariant, SHIPPED_ROUGH_VARIANT_INDEX,
} from '../src/engine/src/paperNoise.js'

const PAPER_TYPES = Object.keys(PAPER_GRAIN_CONFIGS) as PaperType[]

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public/paper')
mkdirSync(outDir, { recursive: true })

for (const type of PAPER_TYPES) {
  const cfg = PAPER_GRAIN_CONFIGS[type]
  const roughness = PAPER_ROUGHNESS[type]
  const res = PAPER_BAKE_RESOLUTION
  // Interleaved LUMINANCE_ALPHA: [height0, catch0, height1, catch1, ...] —
  // matches gl.texImage2D(..., gl.LUMINANCE_ALPHA, ...)'s expected layout
  // (see paperLoader.ts's uploadPaperTexture) and what texture2D(...).r /
  // .a read back in DISPLAY_FRAG/PAPER_BLEND_FRAG (height) and DAB_FRAG
  // (catch) respectively.
  const bytes = new Uint8Array(res * res * 2)

  // rough ships one of the ROUGH_VARIANTS candidates (see
  // SHIPPED_ROUGH_VARIANT_INDEX's own comment — picked by ear/eye via the
  // Settings panel's dev picker) instead of the generic paperHeight/
  // paperCatchValue+cfg formula smooth/bristol still use.
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const h = type === 'rough'
        ? paperHeightForRoughVariant(x + 0.5, y + 0.5, res, res, SHIPPED_ROUGH_VARIANT_INDEX)
        : paperHeight(x + 0.5, y + 0.5, res, res, cfg, /* seamless */ true)
      const catchV = type === 'rough'
        ? paperCatchValueForRoughVariant(x + 0.5, y + 0.5, res, res, SHIPPED_ROUGH_VARIANT_INDEX)
        : paperCatchValue(x + 0.5, y + 0.5, res, res, cfg, roughness)
      const idx = (y * res + x) * 2
      bytes[idx] = Math.round(h * 255)
      bytes[idx + 1] = Math.round(catchV * 255)
    }
  }

  const compressed = gzipSync(bytes, { level: 9 })
  // Extension is deliberately NOT `.gz` (or any other extension a static
  // file server might special-case): some servers (Vite's own dev server
  // included — confirmed by hand) auto-tag a `.gz` file with `Content-
  // Encoding: gzip`, which makes the *browser itself* transparently
  // decompress it before paperLoader.ts's fetch() ever sees the bytes —
  // silently breaking its own explicit DecompressionStream('gzip') step
  // (double-decompression, not decompression twice removed). An
  // unrecognized extension guarantees no server has a reason to reinterpret
  // the payload, so the only decompression that ever happens is the one
  // this codebase explicitly controls.
  const outPath = join(outDir, `${type}.paper`)
  writeFileSync(outPath, compressed)

  const rawKiB = (bytes.byteLength / 1024).toFixed(0)
  const gzKiB = (compressed.byteLength / 1024).toFixed(0)
  const ratio = ((compressed.byteLength / bytes.byteLength) * 100).toFixed(1)
  console.log(`${type}: ${rawKiB} KiB -> ${gzKiB} KiB (${ratio}%) -> ${outPath}`)
}

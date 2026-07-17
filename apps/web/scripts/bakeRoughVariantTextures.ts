// Dev-only sibling of bakePaperTextures.ts: bakes ROUGH_VARIANTS (see
// ../src/engine/src/paperNoise.ts) instead of the real, shipped
// PAPER_GRAIN_CONFIGS — one file per candidate fiber algorithm, for live
// in-app A/B comparison via the Settings panel's "Paper grain variant"
// control (see featureFlags.ts/paperLoader.ts). Same interleaved
// LUMINANCE_ALPHA byte layout as the real bake, so the app's existing
// texture-upload path (uploadPaperTexture) loads these completely
// unchanged — only the fetch URL differs.
//
// Output goes to public/paper-variants/, which is .gitignored: these are
// disposable exploration assets (10 files x ~7MB gzipped), not something to
// commit — run `npm run bake:paper-variants` locally whenever you want to
// look at them. Once a favorite is picked, its algorithm should be folded
// into PAPER_GRAIN_CONFIGS.rough for real and baked via the normal
// `npm run bake:paper` instead.
import { gzipSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PAPER_BAKE_RESOLUTION, ROUGH_VARIANTS, paperCatchValueForRoughVariant, paperHeightForRoughVariant,
} from '../src/engine/src/paperNoise.js'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public/paper-variants')
mkdirSync(outDir, { recursive: true })

const res = PAPER_BAKE_RESOLUTION

for (let i = 0; i < ROUGH_VARIANTS.length; i++) {
  const bytes = new Uint8Array(res * res * 2)

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const h = paperHeightForRoughVariant(x + 0.5, y + 0.5, res, res, i)
      const catchV = paperCatchValueForRoughVariant(x + 0.5, y + 0.5, res, res, i)
      const idx = (y * res + x) * 2
      bytes[idx] = Math.round(h * 255)
      bytes[idx + 1] = Math.round(catchV * 255)
    }
  }

  const compressed = gzipSync(bytes, { level: 9 })
  // Same non-`.gz` extension reasoning as bakePaperTextures.ts.
  const outPath = join(outDir, `rough-v${i + 1}.paper`)
  writeFileSync(outPath, compressed)

  const gzKiB = (compressed.byteLength / 1024).toFixed(0)
  console.log(`v${i + 1} (${ROUGH_VARIANTS[i].label}): ${gzKiB} KiB -> ${outPath}`)
}

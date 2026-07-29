// Shared output half of the paper bake: turning a finished height/catch pair
// into the two files a client actually fetches. Extracted from
// bakePaperTextures.ts to keep the format in one place — the interleaving, the gzip and the
// deliberately-unrecognised extension are all load-bearing (see below), and
// two copies of that would drift.
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PAPER_BAKE_RESOLUTION, PAPER_WORLD_SIZE } from '../src/engine/src/paperConstants.js'
import type { PaperAssetEntry } from '../src/engine/src/paperManifest.js'

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

/** Box-averages the full-resolution height grid down to preview size. The
 *  averaging is what makes it an honest miniature rather than an aliased
 *  point-sample: at ~13 texels per preview pixel, picking a single texel
 *  turns the grain into moiré that looks nothing like the real surface.
 *  Wraps, since the tile is seamless and the preview spans more than one
 *  repeat. */
export function downsampleToPreview(height: Float64Array, res: number): Uint8Array {
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

const kib = (n: number) => `${Math.round(n / 1024)} KiB`

/** (#322) Content hash that goes into the filename, over the **uncompressed**
 *  payload rather than the gzip stream that actually lands on disk.
 *
 *  The hash's job is to identify *the bake* — the grain a client will draw on
 *  — so that a byte-identical URL can never mean two different textures and
 *  nginx can serve it `immutable`. gzip's output is a function of the zlib
 *  build as well as the input, so hashing the compressed stream would churn
 *  every filename on a Node upgrade that changed nothing about the grain,
 *  forcing every returning user to re-download 22 MB for no reason. Hashing
 *  the payload also makes the hash the honest answer to "is this the same
 *  paper?", which is the question the cache is really asking.
 *
 *  8 hex chars (32 bits) is plenty, but be honest about what a collision would
 *  cost rather than waving it off: two *different* payloads landing on the
 *  same name means a client holding the immutably-cached old texture never
 *  fetches the new one and draws on a different grain than its peers — the
 *  silent cross-device divergence .claude/rules.md exists to prevent, and the
 *  hardest possible class of bug to trace. What makes 32 bits fine is the
 *  namespace, not the blast radius: it is three papers per bake, re-baked by
 *  hand a handful of times over the project's life, so the probability is
 *  negligible even by birthday-bound reasoning. If the paper set ever grows by
 *  orders of magnitude, lengthen this rather than re-deriving the argument. */
function contentHash(payload: Uint8Array): string {
  return createHash('sha256').update(payload).digest('hex').slice(0, 8)
}

/** One paper's two files, as the manifest records them. `*Bytes` are the
 *  **on-disk / on-the-wire** sizes (the gzip streams), not the decompressed
 *  payload: that is what a Content-Length would report, what a progress
 *  indicator has to count against, and what a `statSync().size` check can
 *  compare to catch a half-restored CI cache.
 *
 *  An alias for the reader's benefit, not a second declaration: this is
 *  literally the manifest's entry type, and CLAUDE.md's "avoid redefining
 *  shared types" is pointed at exactly this. Two identical four-field
 *  interfaces tied together only by structural assignment at one call site
 *  would let a field added to one and not the other typecheck everywhere that
 *  matters, right up until something read the missing field at runtime. */
export type PaperAssetNames = PaperAssetEntry

/** Writes `<type>.<hash>.paper` + `<type>.<hash>.preview` for one paper, and
 *  returns the names it chose — the caller cannot reconstruct them, which is
 *  the whole point of hashing, so the manifest has to be assembled from these
 *  return values (see bakePaperTextures.ts).
 *
 *  The two files get **independent** hashes: the preview is a downsample of
 *  `height` alone and carries no catch channel, so it is a different payload
 *  and a shared hash would be a lie about one of them.
 *
 *  `height` and `catch` are both 0..1 grids of `res * res`; `height` is the
 *  already-display-curved value (the `.r` channel, blank-paper tint) and
 *  `catchGrid` the already-amplified graphite response (`.a`, stroke) — see
 *  paperNoise.ts's paperCatchValue on why the amplification happens here and
 *  never on the GPU. */
export function writePaperAsset(
  outDir: string, type: string, height: Float64Array, catchGrid: Float64Array, res: number,
): PaperAssetNames {
  // Interleaved LUMINANCE_ALPHA: [height0, catch0, height1, catch1, ...] —
  // matches gl.texImage2D(..., gl.LUMINANCE_ALPHA, ...)'s expected layout
  // (see paperLoader.ts's uploadPaperTexture) and what texture2D(...).r / .a
  // read back in DISPLAY_FRAG/PAPER_BLEND_FRAG (height) and DAB_FRAG (catch).
  const bytes = new Uint8Array(res * res * 2)
  for (let i = 0; i < res * res; i++) {
    bytes[i * 2] = Math.round(height[i] * 255)
    bytes[i * 2 + 1] = Math.round(catchGrid[i] * 255)
  }

  // Extension is deliberately NOT `.gz` (or any other extension a static file
  // server might special-case): some servers (Vite's own dev server included
  // — confirmed by hand) auto-tag a `.gz` file with `Content-Encoding: gzip`,
  // which makes the *browser itself* transparently decompress it before
  // paperLoader.ts's fetch() ever sees the bytes, silently breaking its own
  // explicit DecompressionStream('gzip') step. An unrecognized extension
  // guarantees no server has a reason to reinterpret the payload.
  //
  // (#322) The hash goes *before* that extension, never after it: a
  // `<type>.paper.<hash>` would hand every static server a brand-new unknown
  // final extension to guess at, and the guessing is exactly what the
  // paragraph above exists to prevent. `.paper`/`.preview` stay the last
  // segment, so nothing about how a server treats these files changes.
  const compressed = gzipSync(bytes, { level: 9 })
  const textureName = `${type}.${contentHash(bytes)}.paper`
  writeFileSync(join(outDir, textureName), compressed)

  const previewPayload = downsampleToPreview(height, res)
  const preview = gzipSync(previewPayload, { level: 9 })
  const previewName = `${type}.${contentHash(previewPayload)}.preview`
  writeFileSync(join(outDir, previewName), preview)

  console.log(`${type}: ${kib(bytes.byteLength)} -> ${kib(compressed.byteLength)} texture (${textureName}), ${kib(preview.byteLength)} preview (${previewName})`)

  return {
    texture: textureName,
    textureBytes: compressed.byteLength,
    preview: previewName,
    previewBytes: preview.byteLength,
  }
}

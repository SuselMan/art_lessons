// Rasterizes the app icon (#47) from src/assets/logo-icon.svg into the PNG
// sizes an installable PWA actually needs, writing them to public/.
//
// Unlike the paper bake next door, the output IS committed: it is ~30 KB
// total, it changes only when the logo does, and having it in the repo means
// neither CI nor a fresh clone needs a native image toolchain to produce a
// working build. Re-run by hand with `npm run bake:icons` after touching the
// logo — nothing runs this automatically.
//
// Two families come out of the same artwork, and the difference between them
// is the whole reason this script exists rather than one hand-exported PNG:
//
//   icon-<n>.png           purpose "any"      — shown as-is, full bleed.
//   icon-maskable-<n>.png  purpose "maskable" — Android crops it to whatever
//                          shape the launcher uses (circle, squircle, …), so
//                          the artwork has to sit inside the safe zone with
//                          the plate bleeding out behind it.
//
// A single file cannot be both: full-bleed artwork loses its edges under the
// mask, and safe-zone artwork looks small and lost when shown uncropped.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = join(HERE, '../src/assets/logo-icon.svg')
const OUT_DIR = join(HERE, '../public')

// The logo's own plate. The source SVG already paints a black background
// rect, but that rect misses the left edge of the viewBox by ~0.4 units, so
// a naive render leaves a sub-pixel transparent sliver down one side. Every
// output here is flattened onto this colour, which closes that seam and
// guarantees opacity — `apple-touch-icon` must be opaque (iOS composites a
// transparent icon over black, which would put a dark logo on dark), and a
// maskable icon must be opaque to the corners or the launcher's crop shows
// through.
const PLATE = '#000000'

// Rasterization DPI for the SVG. The source declares a viewBox but no
// width/height, so librsvg renders it at ~407 px at the default 72 dpi —
// upscaling that to 512 would visibly soften the curves. 600 dpi gives
// ~3.4k px, which then downsamples cleanly to every size below.
const DENSITY = 600

// How much of the icon the artwork occupies in the maskable variant.
//
// The spec's safe zone is a circle of diameter 80% of the icon, i.e. radius
// 0.8 of the half-side. Measured against this artwork, the mark's farthest
// point from centre (the tip of the pencil tail, lower right) sits at 0.967
// of the half-side — so it would need to shrink to 0.827 to land exactly on
// the safe circle. 0.80 leaves a little margin on top of that.
//
// Note this is a *radial* measurement, not the bounding box: the bounding
// box's diagonal would have demanded a much harsher 0.78 to fit, wasting
// room the round-ish mark does not actually use out at its corners.
const MASKABLE_SCALE = 0.8

interface IconSpec {
  file: string
  size: number
  /** Fraction of the canvas the artwork fills; the rest is plate. */
  scale: number
}

const ICONS: IconSpec[] = [
  // Manifest, purpose "any". 192 is the historical install-prompt size,
  // 512 is what Android uses for the splash screen and the app switcher.
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // Manifest, purpose "maskable".
  { file: 'icon-maskable-192.png', size: 192, scale: MASKABLE_SCALE },
  { file: 'icon-maskable-512.png', size: 512, scale: MASKABLE_SCALE },
  // iOS home screen. Not referenced by the manifest at all — Safari reads
  // <link rel="apple-touch-icon"> instead, and ignores maskable entirely
  // (it applies its own fixed corner radius), so this is the full-bleed
  // artwork at the one size iOS asks for.
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  // Browser-tab fallback for engines that don't take an SVG favicon
  // (Safari, and anything old). favicon.svg stays the primary.
  { file: 'favicon-96.png', size: 96, scale: 1 },
]

async function bakeIcon(svg: Buffer, { file, size, scale }: IconSpec): Promise<void> {
  const inner = Math.round(size * scale)
  const left = Math.floor((size - inner) / 2)
  const top = Math.floor((size - inner) / 2)

  // `fit: 'contain'` rather than 'fill': the source viewBox is 407.1 x 403.7,
  // very nearly but not exactly square, and stretching it to square would
  // distort the mark by ~0.8% for no reason. The letterbox it produces
  // instead is the plate colour, so it is invisible.
  let img = sharp(svg, { density: DENSITY })
    .resize(inner, inner, { fit: 'contain', background: PLATE })

  if (inner !== size) {
    img = img.extend({ top, left, bottom: size - inner - top, right: size - inner - left, background: PLATE })
  }

  const png = await img.flatten({ background: PLATE }).png({ compressionLevel: 9 }).toBuffer()
  writeFileSync(join(OUT_DIR, file), png)
  console.log(`  ${file.padEnd(24)} ${size}x${size}  artwork ${Math.round(scale * 100)}%  ${(png.length / 1024).toFixed(1)} KB`)
}

async function main(): Promise<void> {
  const svg = readFileSync(SOURCE)
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Baking app icons from ${SOURCE}`)
  for (const spec of ICONS) await bakeIcon(svg, spec)

  // The SVG favicon is the same artwork, served straight from public/ so a
  // browser that supports it gets the crisp vector at any tab density.
  writeFileSync(join(OUT_DIR, 'favicon.svg'), svg)
  console.log(`  ${'favicon.svg'.padEnd(24)} vector    (copied from source)`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})

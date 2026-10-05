// Rasterizes the app icon (#47) from src/assets/logo.svg into the PNG
// sizes an installable PWA actually needs, writing them to public/.
//
// Unlike the paper bake next door, the output IS committed: it changes only
// when the logo does, and having it in the repo means
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
const SOURCE = join(HERE, '../src/assets/logo.svg')
const OUT_DIR = join(HERE, '../public')

// Opaque plates are required by iOS and Android maskable icons.
const PLATE = '#000000'

// The 316-unit crop renders at 632 px, enough for the largest PNG.
const DENSITY = 144

// Every nontransparent source pixel is inside radius 1.281 (half-side units).
// At 62% it fits Android's circular safe zone of radius 0.8, including flecks.
const MASKABLE_SCALE = 0.62

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
  // Crop the same source artwork to the letter and embed the original PNG
  // so favicon.svg works as a standalone image (SVG images cannot fetch it).
  const mark = readFileSync(join(HERE, '../public/brand/grafetto-g.png'))
  const svg = Buffer.from(readFileSync(SOURCE, 'utf8')
    .replace(/^[ \t]*<g id="logo-wordmark"[\s\S]*?<\/g>/m, '')
    .replace(/viewBox="[^"]*"/, 'viewBox="40 42 316 316"')
    .replace('href="/brand/grafetto-g.png"', `href="data:image/png;base64,${mark.toString('base64')}"`))
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Baking app icons from ${SOURCE}`)
  for (const spec of ICONS) await bakeIcon(svg, spec)

  // An SVG favicon is an image document: external PNG references are blocked.
  // Embed a 192px copy instead of making every tab fetch the 1.2MB original.
  const faviconMark = await sharp(mark).resize(192, 192, { fit: 'inside' }).png().toBuffer()
  const favicon = svg.toString().replace(mark.toString('base64'), faviconMark.toString('base64'))
  writeFileSync(join(OUT_DIR, 'favicon.svg'), favicon)
  console.log('  favicon.svg              standalone embedded artwork')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})

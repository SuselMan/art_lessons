// Bakes the icon font this app actually ships (#322): a subset of Material
// Symbols Outlined containing only the glyphs named in src/icons/iconNames.ts.
//
// Why this exists at all: the font used to come from fonts.googleapis.com with
// `display=block`, which renders unloaded glyphs as *nothing* rather than as
// fallback text. Offline — the state a PWA is expected to survive — that gave
// a toolbar of blank buttons. Self-hosting also takes a third-party CDN out of
// the critical render path, but the offline hole is the reason.
//
// Like bake:icons next door, the output IS committed (it is a few KB, and it
// changes only when the icon list does), so neither CI nor a fresh clone runs
// this. Re-run it by hand with `npm run bake:icon-font` after editing the list.
//
// ---------------------------------------------------------------------------
// The one non-obvious decision: subset by codepoint, not by ligature.
//
// Material Symbols renders `<span>delete</span>` by substituting the letters
// d-e-l-e-t-e for one glyph via the `liga` OpenType feature. The intuitive
// subset — "keep the text of every icon name we use" — therefore has to keep
// those letters, and the subsetter must then keep every ligature those letters
// can still form. Our ~60 names between them use the entire alphabet, so that
// closure retains essentially all ~3600 icons in the font.
//
// Measured on this exact font and icon list:
//
//   subset by ligature text   269.7 KB
//   subset by codepoint         4.7 KB
//
// Same 60 icons, 57x apart. So the bake resolves each name to the private-use
// codepoint its glyph is mapped to and subsets by those instead, and Icon.tsx
// renders the codepoint rather than the name. The generated map below is what
// carries the translation.
//
// The mapping is derived from the font itself rather than from Google's
// published .codepoints file, which the npm package does not ship: deriving it
// means the map cannot drift out of step with the font it was built from, and
// a name Material has renamed or dropped fails the bake instead of silently
// baking a blank.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as fontkit from 'fontkit'
import subsetFont from 'subset-font'

import { MATERIAL_ICON_NAMES } from '../src/icons/iconNames.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const SOURCE = require.resolve('material-symbols/material-symbols-outlined.woff2')
const FONT_OUT = join(HERE, '../src/assets/fonts/material-symbols-subset.woff2')
const MAP_OUT = join(HERE, '../src/icons/codepoints.generated.ts')

// The four variable axes, pinned to the values index.html used to ask Google
// for (`opsz,wght,FILL,GRAD@24,200,0,0`). Pinning matters far more than it
// looks: it collapses the variable font to a static instance and drops the
// delta tables, which is most of the difference between a 3.9 MB source and
// a subset measured in kilobytes. wght 200 is the project's thin variant.
const AXES = { opsz: 24, wght: 200, FILL: 0, GRAD: 0 }

/** Reverse of the font's cmap: glyph id -> the codepoint that selects it. */
function codepointsByGlyph(font: fontkit.Font): Map<number, number> {
  const byGlyph = new Map<number, number>()
  for (const cp of font.characterSet) {
    const id = font.glyphForCodePoint(cp).id
    // Lowest codepoint wins. Material maps a handful of glyphs twice (a
    // renamed icon keeps its old codepoint as an alias); either selects the
    // same outline, so the choice only needs to be deterministic.
    if (!byGlyph.has(id) || cp < byGlyph.get(id)!) byGlyph.set(id, cp)
  }
  return byGlyph
}

/** Resolves an icon name through the font's own `liga` table to its codepoint. */
function resolve(font: fontkit.Font, byGlyph: Map<number, number>, name: string): number | null {
  // A real icon name shapes to exactly one glyph — the ligature swallowed
  // every letter. Anything else (a typo, a renamed icon, a name that is not
  // in this font at all) comes back as the individual letters instead, which
  // is the check that keeps a bad name out of the shipped map.
  const glyphs = font.layout(name).glyphs
  if (glyphs.length !== 1) return null
  const cp = byGlyph.get(glyphs[0].id)
  return cp ?? null
}

async function main(): Promise<void> {
  const source = readFileSync(SOURCE)
  const font = fontkit.create(source)
  if (!('characterSet' in font)) throw new Error(`${SOURCE} is a font collection, expected a single font`)

  const byGlyph = codepointsByGlyph(font)
  const resolved: { name: string; cp: number }[] = []
  const unresolved: string[] = []

  for (const name of MATERIAL_ICON_NAMES) {
    const cp = resolve(font, byGlyph, name)
    if (cp === null) unresolved.push(name)
    else resolved.push({ name, cp })
  }

  if (unresolved.length > 0) {
    throw new Error(
      `Not a Material Symbols icon name: ${unresolved.join(', ')}\n` +
        `Check the spelling against https://fonts.google.com/icons — a renamed or\n` +
        `dropped icon lands here too, and needs its call sites updated, not a retry.`,
    )
  }

  const text = resolved.map(({ cp }) => String.fromCodePoint(cp)).join('')

  const subset = await subsetFont(source, text, { targetFormat: 'woff2', variationAxes: AXES })
  mkdirSync(dirname(FONT_OUT), { recursive: true })
  writeFileSync(FONT_OUT, subset)

  const entries = resolved.map(({ name, cp }) => `  '${name}': '\\u{${cp.toString(16)}}',`).join('\n')

  writeFileSync(
    MAP_OUT,
    `// GENERATED by scripts/bakeIconFont.ts — do not edit by hand.\n` +
      `// Run \`npm run bake:icon-font\` after changing src/icons/iconNames.ts.\n` +
      `//\n` +
      `// Maps each icon name to the private-use codepoint of its glyph in\n` +
      `// src/assets/fonts/material-symbols-subset.woff2. Typed as a total Record\n` +
      `// so that an icon added to the list without re-running the bake fails to\n` +
      `// compile rather than rendering as a blank.\n` +
      `import type { MaterialIconName } from './iconNames'\n` +
      `\n` +
      `export const ICON_CODEPOINTS: Record<MaterialIconName, string> = {\n` +
      `${entries}\n` +
      `}\n`,
  )

  const sourceKb = (source.length / 1024).toFixed(0)
  const subsetKb = (subset.length / 1024).toFixed(1)
  console.log(`Baked ${resolved.length} icons from ${SOURCE}`)
  console.log(`  material-symbols-subset.woff2   ${subsetKb} KB  (source ${sourceKb} KB)`)
  console.log(`  codepoints.generated.ts         ${resolved.length} entries`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})

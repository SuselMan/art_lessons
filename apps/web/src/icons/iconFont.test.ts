/// <reference types="node" />
// Checks the baked icon font itself, not the code that made it — same shape as
// paperAssets.test.ts next door, and it needs Node's ambient types explicitly
// for the same reason (tsconfig.app.json's `types` is DOM-only on purpose).
//
// What the type system already covers, and what it does not: ICON_CODEPOINTS
// is a total `Record<MaterialIconName, string>`, so a name added to the list
// without re-baking fails to compile, and a name removed leaves an excess key
// that also fails. Neither says anything about the woff2. A stale font file —
// re-baked map, forgotten binary, or a subset that lost its glyphs — type
// checks perfectly and renders blank squares.
//
// Unlike the paper bake, this output is committed, so there is no "skip if
// the bake hasn't run" branch here: if the file is missing, that is the bug.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as fontkit from 'fontkit'
import { describe, expect, it } from 'vitest'

import { ICON_CODEPOINTS } from './codepoints.generated'
import { MATERIAL_ICON_NAMES } from './iconNames'

const fontPath = join(dirname(fileURLToPath(import.meta.url)), '../assets/fonts/material-symbols-subset.woff2')

function openFont(): fontkit.Font {
  const font = fontkit.create(readFileSync(fontPath))
  if (!('characterSet' in font)) throw new Error('expected a single font, got a collection')
  return font
}

describe('baked icon font', () => {
  it('has a glyph for every icon the app can name', () => {
    const font = openFont()
    const covered = new Set(font.characterSet)

    const missing = MATERIAL_ICON_NAMES.filter(
      (name) => !covered.has(ICON_CODEPOINTS[name].codePointAt(0)!),
    )

    expect(missing, 'run `npm run bake:icon-font` — the font is older than the icon list').toEqual([])
  })

  it('draws something for every glyph, not .notdef', () => {
    const font = openFont()

    // A codepoint can survive in cmap while pointing at the empty glyph 0,
    // which is what a subset that dropped the outline would look like: the
    // check above would pass and every button would render blank.
    const blank = MATERIAL_ICON_NAMES.filter((name) => {
      const glyph = font.glyphForCodePoint(ICON_CODEPOINTS[name].codePointAt(0)!)
      return glyph.id === 0 || glyph.path.commands.length === 0
    })

    expect(blank, 'these icons are mapped but have no outline').toEqual([])
  })

  it('stays a subset', () => {
    // The source font is 3.9 MB. This ceiling is what catches the bake losing
    // either half of what makes it small — the codepoint subsetting (which
    // would pull in every ligature-reachable icon, measured at 270 KB) or the
    // variation-axis pinning (which alone accounts for most of the rest).
    // Generous on purpose: it is a tripwire for a broken bake, not a budget.
    const bytes = readFileSync(fontPath).length
    expect(bytes).toBeLessThan(64 * 1024)
  })
})

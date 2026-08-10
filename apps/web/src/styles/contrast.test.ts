import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** (#426) The light theme exists because someone could not read the interface,
 *  so "is it readable" is the one property of it that must not rest on
 *  eyeballing a screenshot. This parses tokens.css itself — not a copy of the
 *  values kept in TypeScript, which would drift the first time someone edits
 *  the stylesheet and nothing failed.
 *
 *  What it does not do: check that a given token is actually *used* as text on
 *  a given surface. It checks that every pair the components can plausibly
 *  form clears its floor, which is the conservative direction — a pair no
 *  component ever draws costs a slightly stricter palette, whereas the reverse
 *  would let a real pair through unmeasured. */

const TOKENS_CSS = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

/** Strips comments first: tokens.css explains itself at length, and several of
 *  those comments quote hex values that are not declarations (#111113, the
 *  colours the #343 note lists as having been replaced). Parsing without this
 *  step reads them as tokens. */
function parseBlock(css: string, selector: string): Record<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const start = withoutComments.indexOf(selector)
  if (start === -1) throw new Error(`tokens.css has no ${selector} block`)
  const open = withoutComments.indexOf('{', start)
  const close = withoutComments.indexOf('}', open)
  const body = withoutComments.slice(open + 1, close)

  const out: Record<string, string> = {}
  for (const line of body.split(';')) {
    const [rawName, ...rest] = line.split(':')
    const name = rawName.trim()
    if (!name.startsWith('--')) continue
    out[name] = rest.join(':').trim()
  }
  return out
}

const dark = parseBlock(TOKENS_CSS, ':root {')
const light = { ...dark, ...parseBlock(TOKENS_CSS, ":root[data-theme='light']") }

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  )
}

/** WCAG 2.1 contrast ratio, rounded to two decimals so a failure message reads
 *  like the numbers people quote at each other. */
function contrast(themeTokens: Record<string, string>, a: string, b: string): number {
  const la = luminance(themeTokens[a] ?? a)
  const lb = luminance(themeTokens[b] ?? b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

/** Every surface a component can put text on. */
const SURFACES = [
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
  '--color-surface-2',
  '--color-surface-hover',
]

const AA = 4.5
const AAA = 7
/** WCAG 1.4.11 for non-text: a control boundary you have to be able to find. */
const NON_TEXT = 3

describe('light theme contrast (#426)', () => {
  it.each(SURFACES)('body text clears AAA on %s', surface => {
    expect(contrast(light, '--color-text', surface)).toBeGreaterThanOrEqual(AAA)
  })

  it.each(SURFACES)('emphasised text clears AAA on %s', surface => {
    expect(contrast(light, '--color-text-bright', surface)).toBeGreaterThanOrEqual(AAA)
  })

  // The token that most often gets picked "because it's secondary" and then
  // carries a hint someone actually has to read.
  it.each(SURFACES)('dimmed text clears AA on %s', surface => {
    expect(contrast(light, '--color-text-dim', surface)).toBeGreaterThanOrEqual(AA)
  })

  // The quietest tier in the palette, and the one a light theme is most
  // likely to lose — it is where the layer panel's opacity-dimmed glyphs
  // landed before they became a token (see --color-text-faint's own note).
  it.each(SURFACES)('faint text clears AA on %s', surface => {
    expect(contrast(light, '--color-text-faint', surface)).toBeGreaterThanOrEqual(AA)
  })

  it.each(SURFACES)('borders clear the non-text floor on %s', surface => {
    expect(contrast(light, '--color-border', surface)).toBeGreaterThanOrEqual(NON_TEXT)
  })

  it.each(['--color-error', '--color-warning', '--color-success'])(
    '%s clears AA as text on the surfaces it is used on',
    status => {
      for (const surface of ['--color-surface', '--color-surface-raised', '--color-bg']) {
        expect(contrast(light, status, surface)).toBeGreaterThanOrEqual(AA)
      }
    },
  )
})

describe('text on filled controls (#426)', () => {
  // Both themes: a filled button is the one place where the *background* is
  // the themed value and the text is fixed white, so getting it wrong is
  // invisible until someone tries to read a button.
  const FILLS = [
    '--color-accent',
    '--color-accent-hover',
    '--color-accent-active',
    '--color-error-fill',
    '--color-error-fill-hover',
  ]

  it.each(FILLS)('dark: --color-on-accent clears AA on %s', fill => {
    expect(contrast(dark, '--color-on-accent', fill)).toBeGreaterThanOrEqual(AA)
  })

  it.each(FILLS)('light: --color-on-accent clears AA on %s', fill => {
    expect(contrast(light, '--color-on-accent', fill)).toBeGreaterThanOrEqual(AA)
  })
})

describe('dark theme contrast (#426)', () => {
  // The dark theme is the default and is not being redesigned here, so it is
  // held to what it already achieves: text is genuinely fine, and the two
  // places it falls short are pinned rather than raised. See the note at the
  // top of tokens.css.
  it.each(SURFACES)('body text clears AAA on %s', surface => {
    expect(contrast(dark, '--color-text', surface)).toBeGreaterThanOrEqual(AAA)
  })

  it('known exception: --color-border is a tonal edge, not a visible outline', () => {
    // Pinned, not endorsed. If a redesign raises this above the non-text floor
    // the assertion below fails and this test should simply be deleted.
    expect(contrast(dark, '--color-border', '--color-surface')).toBeLessThan(NON_TEXT)
    expect(contrast(dark, '--color-border', '--color-surface')).toBeGreaterThanOrEqual(1.3)
  })

  it('known exception: --color-text-dim sits at roughly 3:1', () => {
    expect(contrast(dark, '--color-text-dim', '--color-bg')).toBeGreaterThanOrEqual(3)
    expect(contrast(dark, '--color-text-dim', '--color-bg')).toBeLessThan(AA)
  })
})

describe('the two palettes stay in step', () => {
  it('light overrides only colour tokens, never structural ones', () => {
    // Sizes, radii, timings and stacking are one set of numbers shared by both
    // themes — a theme that moved those would be a second design, not a second
    // palette (tokens.css says so; this is what holds it to it).
    const overridden = Object.keys(parseBlock(TOKENS_CSS, ":root[data-theme='light']"))
    const structural = overridden.filter(
      name => !name.startsWith('--color-') && !name.startsWith('--shadow-'),
    )
    expect(structural).toEqual([])
  })

  it('every colour token the light theme overrides exists in the default theme', () => {
    // Catches the typo case: a light-only `--color-suface` would silently do
    // nothing, and nothing else in the build would notice.
    const overridden = Object.keys(parseBlock(TOKENS_CSS, ":root[data-theme='light']"))
    const unknown = overridden.filter(name => !(name in dark))
    expect(unknown).toEqual([])
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
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

  // WCAG 1.4.11 is about *controls* — the boundary of a thing you operate and
  // has to be findable. It is not about every edge on the screen, and the
  // first cut of this theme applied it to all of them: panel edges, card
  // outlines and dividers all sat at a control's floor, and the result read as
  // loud enough to distract from the content the borders were bounding.
  //
  // So the floor moved to the token that carries the meaning, and the surfaces
  // are the fills a control actually rests on. --color-bg is not among them:
  // controls sit inside panels and cards, not directly on the page.
  const CONTROL_SURFACES = ['--color-surface', '--color-surface-raised', '--color-surface-2']

  it.each(CONTROL_SURFACES)('control borders clear the non-text floor on %s', surface => {
    expect(contrast(light, '--color-border-strong', surface)).toBeGreaterThanOrEqual(NON_TEXT)
  })

  // The other half of the same correction, and the reason it is a test rather
  // than a comment: nothing else would stop a future pass from "fixing" the
  // structural border by making it accessible again, which is exactly the
  // change that was just reverted. A decorative edge in this theme should be
  // about as quiet as the dark theme's own already is (~1.3:1) — it confirms a
  // boundary the fill has already drawn, it doesn't announce one.
  it.each(['--color-surface', '--color-surface-raised'])(
    'structural borders stay quiet on %s',
    surface => {
      expect(contrast(light, '--color-border', surface)).toBeLessThanOrEqual(1.6)
    },
  )

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

describe('components actually reach for --color-on-accent', () => {
  /** Closes the gap this file's own header admits to: proving the token is
   *  readable on the fill says nothing about whether the buttons use it. They
   *  did not. Six rules painted a solid accent fill and then named some other
   *  colour on top — ConfirmDialog's primary button and the ruler's
   *  measurement label took --color-text-bright, which is #000 in the light
   *  theme against a fill that does not flip (2.8:1); the settings Save button
   *  took --color-bg, the same mistake mirrored into the dark theme (3.3:1);
   *  three more wrote a literal #fff, which is right today and unowned
   *  tomorrow, exactly as tokens.css warns where it declares the token.
   *
   *  Scoped to *solid* fills that also declare a colour. A color-mix() tint is
   *  a different question — the text there sits on a blend with the surface
   *  behind it, and themed text is usually correct on one. A rule with no
   *  colour of its own is left alone too: those are tracks, thumbs, progress
   *  bars and hover states that only repaint the background. */
  const SRC = fileURLToPath(new URL('..', import.meta.url))
  const SOLID_FILL =
    /background(?:-color)?\s*:\s*var\(--color-(?:accent|accent-hover|accent-active|error-fill|error-fill-hover)\)/

  function cssFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
    )
  }

  const offenders: string[] = []
  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const [, rawSelector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!SOLID_FILL.test(body)) continue
      const declared = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(body)?.[1].trim()
      if (declared === undefined || declared === 'var(--color-on-accent)') continue
      offenders.push(`${relative(SRC, file).replace(/\\/g, '/')} — ${rawSelector.trim().replace(/\s+/g, ' ')} → ${declared}`)
    }
  }

  it('no rule paints a solid accent fill and then names its own text colour', () => {
    expect(offenders).toEqual([])
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

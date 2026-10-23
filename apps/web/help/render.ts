import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { marked } from 'marked'

import { translate } from '../src/i18n/translate'
import { formatHotkeyLabel, HOTKEY_ACTIONS } from '../src/lib/hotkeys'

/** (#584) The help pages: one Markdown file per article in help/content,
 *  rendered here into static HTML next to the landing. Same rules as the
 *  landing (#246): no app bundle, no /api, nothing but the page.
 *
 *  The HTML is committed, like the baked icon font — `npm run bake:help`
 *  writes it and help.test.ts fails when it is stale, so a Markdown edit
 *  that was never rebaked can't ship looking like the old text.
 *
 *  Anything that already exists as data in the app is generated rather than
 *  retyped: the shortcut table comes from HOTKEY_ACTIONS and the English
 *  dictionary, so a rebound default or a renamed action shows up here on the
 *  next bake instead of going quietly out of date (#353). */

export interface Article {
  slug: string
  title: string
  /** One sentence for search results and link previews. */
  description: string
  section: string
  order: number
  /** Markdown body, front matter removed. */
  body: string
}

/** Sections in the order the sidebar shows them. An article naming a section
 *  that isn't here fails the bake rather than silently vanishing from the nav. */
export const SECTIONS = ['Lessons', 'Homework', 'Devices', 'Reference', 'How it works'] as const

const SITE = 'https://grafetto.com'

export function parseArticle(slug: string, source: string): Article {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
  if (!match) throw new Error(`help/${slug}.md: missing front matter`)
  const meta = new Map<string, string>()
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta.set(line.slice(0, i).trim(), line.slice(i + 1).trim())
  }
  const need = (key: string): string => {
    const value = meta.get(key)
    if (!value) throw new Error(`help/${slug}.md: front matter needs "${key}"`)
    return value
  }
  const section = need('section')
  if (!(SECTIONS as readonly string[]).includes(section)) {
    throw new Error(`help/${slug}.md: unknown section "${section}" (known: ${SECTIONS.join(', ')})`)
  }
  return {
    slug,
    title: need('title'),
    description: need('description'),
    section,
    order: Number(need('order')),
    body: match[2],
  }
}

export function loadArticles(contentDir: string): Article[] {
  return readdirSync(contentDir)
    .filter(f => f.endsWith('.md'))
    .map(f => parseArticle(f.replace(/\.md$/, ''), readFileSync(join(contentDir, f), 'utf8')))
    .sort((a, b) => SECTIONS.indexOf(a.section as typeof SECTIONS[number]) - SECTIONS.indexOf(b.section as typeof SECTIONS[number]) || a.order - b.order)
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Keys as <kbd>s: "Ctrl+Shift+Z" → Ctrl + Shift + Z, "⌘⇧Z" → ⌘ ⇧ Z. */
function kbd(label: string, mac: boolean): string {
  const parts = mac ? [...label] : label.split('+')
  return parts.map(p => `<kbd>${esc(p)}</kbd>`).join(mac ? '' : '<span class="plus">+</span>')
}

export function hotkeyTable(): string {
  const rows = HOTKEY_ACTIONS.map(a => `<tr><td>${esc(translate('en', a.labelKey))}</td>`
    + `<td>${kbd(formatHotkeyLabel(a.default, false), false)}</td>`
    + `<td>${kbd(formatHotkeyLabel(a.default, true), true)}</td></tr>`).join('\n')
  return `<table class="keys">\n<thead><tr><th>Action</th><th>Windows, Linux</th><th>Mac, iPad</th></tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`
}

/** Placeholders an article can drop into its Markdown for generated content. */
const BLOCKS: Record<string, () => string> = {
  '{{hotkeys}}': hotkeyTable,
}

export function renderBody(body: string): string {
  let md = body
  for (const [token, make] of Object.entries(BLOCKS)) md = md.split(token).join(make())
  return marked.parse(md, { async: false, gfm: true })
}

interface PageParts {
  title: string
  description: string
  canonical: string
  /** Path from this page to help/ (for the stylesheet), e.g. "./" or "../". */
  root: string
  nav: string
  main: string
  jsonLd: object
}

function page(p: PageParts, logoSymbol: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}" />
  <!-- TODO(#584): remove when help goes public together with the landing (#246). -->
  <meta name="robots" content="noindex" />
  <link rel="canonical" href="${p.canonical}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="icon" href="/favicon-96.png" sizes="96x96" type="image/png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="#1a1a1e" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#ececec" media="(prefers-color-scheme: light)" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.description)}" />
  <meta property="og:url" content="${p.canonical}" />
  <script>
    try { var t = localStorage.getItem('grafetto_landing_theme'); if (t) document.documentElement.dataset.theme = t } catch (e) {}
  </script>
  <link rel="stylesheet" href="${p.root}help.css" />
  <script type="application/ld+json">${JSON.stringify(p.jsonLd)}</script>
</head>
<body>
  <!-- Generated by \`npm run bake:help\` from help/content — edit the Markdown, not this file. -->
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">${logoSymbol}</svg>
  <header class="top">
    <a class="wordmark" href="/" aria-label="Grafetto home">
      <svg viewBox="0 0 1130 388" width="118" height="41" aria-hidden="true"><use href="#logo" /></svg>
    </a>
    <a class="help-home" href="/help/">Help</a>
    <div class="top-actions">
      <button class="theme-switch" type="button" aria-label="Switch between light and dark theme">
        <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
        <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      </button>
      <a class="btn btn-primary btn-small" href="/create">Open Grafetto</a>
    </div>
  </header>
  <div class="help">
    <nav class="help-nav" aria-label="Help topics">
${p.nav}
    </nav>
    <main class="help-main">
${p.main}
    </main>
  </div>
  <footer class="foot">
    <nav aria-label="Legal">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="mailto:hello@grafetto.com">hello@grafetto.com</a>
    </nav>
  </footer>
  <script>
    document.querySelector('.theme-switch').addEventListener('click', function () {
      var root = document.documentElement
      var light = root.dataset.theme
        ? root.dataset.theme === 'light'
        : matchMedia('(prefers-color-scheme: light)').matches
      root.dataset.theme = light ? 'dark' : 'light'
      try { localStorage.setItem('grafetto_landing_theme', root.dataset.theme) } catch (e) {}
    })
  </script>
</body>
</html>
`
}

function navHtml(articles: Article[], current: string | null): string {
  return SECTIONS.map(section => {
    const items = articles.filter(a => a.section === section)
    if (!items.length) return ''
    const links = items.map(a => `        <li><a href="/help/${a.slug}/"${a.slug === current ? ' aria-current="page"' : ''}>${esc(a.title)}</a></li>`).join('\n')
    return `      <h2>${esc(section)}</h2>\n      <ul>\n${links}\n      </ul>`
  }).filter(Boolean).join('\n')
}

/** Every file the help site consists of, keyed by its path under help/. */
export function renderSite(articles: Article[], logoSymbol: string): Map<string, string> {
  const out = new Map<string, string>()

  articles.forEach((a, i) => {
    const prev = articles[i - 1]
    const next = articles[i + 1]
    const pager = `<nav class="pager" aria-label="More help">
        ${prev ? `<a class="pager-prev" href="/help/${prev.slug}/"><span>Previous</span>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="pager-next" href="/help/${next.slug}/"><span>Next</span>${esc(next.title)}</a>` : ''}
      </nav>`
    const canonical = `${SITE}/help/${a.slug}/`
    out.set(`${a.slug}/index.html`, page({
      title: `${a.title} — Grafetto Help`,
      description: a.description,
      canonical,
      root: '../',
      nav: navHtml(articles, a.slug),
      main: `      <article class="prose">
        <p class="crumb">${esc(a.section)}</p>
        <h1>${esc(a.title)}</h1>
${renderBody(a.body)}
      </article>
      ${pager}`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: a.title,
        description: a.description,
        url: canonical,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: 'Grafetto Help', url: `${SITE}/help/` },
      },
    }, logoSymbol))
  })

  const cards = SECTIONS.map(section => {
    const items = articles.filter(a => a.section === section)
    if (!items.length) return ''
    return `        <section class="hub-section">
          <h2>${esc(section)}</h2>
          <ul>
${items.map(a => `            <li><a href="/help/${a.slug}/"><strong>${esc(a.title)}</strong><span>${esc(a.description)}</span></a></li>`).join('\n')}
          </ul>
        </section>`
  }).filter(Boolean).join('\n')

  out.set('index.html', page({
    title: 'Grafetto Help',
    description: 'How to run drawing lessons in Grafetto: rooms, homework, pens and tablets, tools and shortcuts.',
    canonical: `${SITE}/help/`,
    root: './',
    nav: navHtml(articles, null),
    main: `      <div class="hub">
        <h1>How can we help?</h1>
        <p class="hub-lede">How to run a lesson, give homework, set up your pen, and what every tool does.</p>
${cards}
      </div>`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Grafetto Help', url: `${SITE}/help/` },
  }, logoSymbol))

  return out
}

/** The logo as an SVG <symbol>, from the same file the app uses. */
export function logoSymbol(svgSource: string): string {
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svgSource)?.[1]?.trim()
  if (!inner) throw new Error('logo.svg: no <svg> content')
  return `<symbol id="logo" viewBox="0 0 1130 388">${inner}</symbol>`
}

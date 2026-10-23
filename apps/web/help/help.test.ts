import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { HOTKEY_ACTIONS } from '../src/lib/hotkeys'
import { hotkeyTable, loadArticles, logoSymbol, renderSite } from './render'

const helpDir = __dirname
const webDir = join(helpDir, '..')

/** (#584) The baked pages are committed; these are what keep them honest. */
describe('help pages', () => {
  const articles = loadArticles(join(helpDir, 'content'))
  const site = renderSite(articles, logoSymbol(readFileSync(join(webDir, 'src/assets/logo.svg'), 'utf8')))

  it('are baked from the current Markdown — run `npm run bake:help` if this fails', () => {
    for (const [rel, html] of site) {
      const path = join(helpDir, rel)
      expect(existsSync(path), `help/${rel} is missing`).toBe(true)
      expect(readFileSync(path, 'utf8'), `help/${rel} is stale`).toBe(html)
    }
  })

  it('leave no page behind for an article that was removed', () => {
    const dirs = readdirSync(helpDir).filter(e => e !== 'content' && statSync(join(helpDir, e)).isDirectory())
    expect(dirs.sort()).toEqual(articles.map(a => a.slug).sort())
  })

  it('link only to articles that exist', () => {
    const slugs = new Set(articles.map(a => a.slug))
    for (const [rel, html] of site) {
      for (const [, slug] of html.matchAll(/href="\/help\/([^/"#]+)\/?/g)) {
        expect(slugs.has(slug), `help/${rel} links to /help/${slug}/, which is not an article`).toBe(true)
      }
    }
  })

  it('list every shortcut the app has', () => {
    const table = hotkeyTable()
    expect(table.match(/<tr><td>/g)).toHaveLength(HOTKEY_ACTIONS.length)
  })
})

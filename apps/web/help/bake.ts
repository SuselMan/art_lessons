// Bakes the help pages (#584): help/content/*.md → help/<slug>/index.html and
// the help/index.html hub. The output is committed — see help/render.ts on why
// — and help.test.ts fails when it has gone stale. Re-run with
// `npm run bake:help` after editing an article, the template, or anything the
// pages generate from (the hotkey registry, the English dictionary).
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadArticles, logoSymbol, renderSite } from './render'

const helpDir = dirname(fileURLToPath(import.meta.url))
const web = join(helpDir, '..')


const files = renderSite(
  loadArticles(join(helpDir, 'content')),
  logoSymbol(readFileSync(join(web, 'src/assets/logo.svg'), 'utf8')),
)

// Drop article folders whose Markdown was deleted or renamed, so a stale page
// can't linger and keep being built into dist/.
for (const entry of readdirSync(helpDir)) {
  const path = join(helpDir, entry)
  if (statSync(path).isDirectory() && entry !== 'content' && !files.has(`${entry}/index.html`)) {
    rmSync(path, { recursive: true })
    console.log(`removed help/${entry}/`)
  }
}

for (const [rel, html] of files) {
  const path = join(helpDir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, html)
}
console.log(`baked ${files.size} help pages`)

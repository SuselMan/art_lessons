// (#437) Guards the two halves of "the bundle goes out compressed", which only
// work as a pair: a .gz twin nginx will not serve is a wasted build step, and
// `gzip_static on` with no twins is a no-op. Either half failing alone is
// silent — the site still works, the deploy still goes green, and the only
// symptom is that everyone downloads three times more than they need to. That
// is exactly how the original defect survived to be found by hand on prod.
//
// Asserted against the config and the policy module rather than against a real
// dist/: the CI test job runs before the build job and never sees one, so a
// check on the output would skip in precisely the situation it exists for —
// the same reasoning src/pwa/workboxConfig.test.ts spells out next door.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { COMPRESSIBLE_EXTENSIONS, MIN_COMPRESSIBLE_BYTES } from './precompressPolicy.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const nginxConf = readFileSync(join(HERE, '..', '..', '..', 'deploy', 'nginx.conf'), 'utf8')

/** The `gzip_types` directive of the main server block, flattened — it is
 *  written across several lines, and nginx cares only about the semicolon. */
function gzipTypes(): string[] {
  const match = /\n\s*gzip_types\s+([^;]+);/.exec(nginxConf)
  if (!match) throw new Error('no gzip_types directive in deploy/nginx.conf')
  return match[1].split(/\s+/).filter(Boolean)
}

describe('pre-compression policy', () => {
  it('never compresses something that is already compressed', () => {
    // A twin here is not merely wasted work: nginx serves whatever twin it
    // finds, and a full comp_level 6 pass over the paper bake measured 2 KB
    // *larger* than its input (#342). So this would make prod slower while
    // looking like an optimisation.
    for (const ext of ['.paper', '.preview', '.png', '.woff2', '.gz']) {
      expect(COMPRESSIBLE_EXTENSIONS.has(ext), ext).toBe(false)
    }
  })

  it('does compress what the first load is actually made of', () => {
    // The other half of the trade, and the self-check: without it the
    // assertion above would pass on an empty set.
    for (const ext of ['.js', '.css', '.html', '.webmanifest']) {
      expect(COMPRESSIBLE_EXTENSIONS.has(ext), ext).toBe(true)
    }
  })

  it('draws the min-size line in the same place as nginx', () => {
    // Two paths to the same bytes: a static twin and on-the-fly compression.
    // Different floors would mean a small file compressed by one and not the
    // other depending only on whether a twin happened to exist.
    const min = /\n\s*gzip_min_length\s+(\d+);/.exec(nginxConf)
    expect(min).not.toBeNull()
    expect(Number(min![1])).toBe(MIN_COMPRESSIBLE_BYTES)
  })
})

describe('nginx compression config', () => {
  it('serves the pre-compressed twins the build writes', () => {
    // Without this the postbuild step is dead weight and every visitor pays
    // for on-the-fly compression of bytes we already have on disk.
    expect(/\n\s*gzip_static\s+on;/.test(nginxConf)).toBe(true)
  })

  it('compresses JS and CSS, the two types the original defect dropped', () => {
    // `gzip_types` at server level replaces the inherited list rather than
    // extending it, so anything not named here is uncompressed no matter what
    // the global config says. This is the regression itself.
    const types = gzipTypes()
    expect(types).toContain('application/javascript')
    expect(types).toContain('text/css')
  })

  it('still compresses the proxied JSON gzip_static cannot help with', () => {
    // /api/ and /socket.io/ responses are generated per request, so they have
    // no twin on disk and depend entirely on the on-the-fly path. The room
    // history that made a long room take minutes to join travels here.
    const types = gzipTypes()
    expect(types).toContain('application/json')
    expect(/\n\s*gzip\s+on;/.test(nginxConf)).toBe(true)
    expect(/\n\s*gzip_proxied\s+any;/.test(nginxConf)).toBe(true)
  })

  it('leaves the baked paper textures alone on both paths', () => {
    // They are gzip streams already, paperLoader.ts inflates them itself, and
    // re-compressing costs Content-Length — which is what drives the room's
    // download progress bar (#345). `gzip off` alone does not cover this:
    // gzip_static is a separate directive and has to be turned off separately.
    const paperBlock = /location\s+~\s+\^\/paper\/[^{]*\{([^}]*)\}/.exec(nginxConf)
    expect(paperBlock, 'no location block for the baked textures').not.toBeNull()
    expect(/\bgzip\s+off;/.test(paperBlock![1])).toBe(true)
    expect(/\bgzip_static\s+off;/.test(paperBlock![1])).toBe(true)
  })
})

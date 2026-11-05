/** Offline-only renderer for one immutable audited official stock SVG.
 * This is deliberately NOT an untrusted SVG upload renderer.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const expected = '9ccd89dfbbd74096b858374700629b94413855276c8075db3f8cbef72e9baa5a'
const chunks = []
let length = 0
for await (const chunk of process.stdin) {
  length += chunk.length
  if (length > 20404) throw new Error('Stock SVG input exceeds pinned size')
  chunks.push(chunk)
}
const input = Buffer.concat(chunks)
if (length !== 20404 || createHash('sha256').update(input).digest('hex') !== expected) {
  throw new Error('Only the pinned official leaves-scattered.svg is accepted')
}
sharp.cache(false)
sharp.concurrency(1)
// Krita renders this viewBox to1000x1000 on white before converting to a mask.
// librsvg edge antialiasing remains an explicitly documented approximation.
const png = await sharp(input, { limitInputPixels: 1_000_000, density: 72 })
  .resize(1000, 1000).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer()
if (png.length > 4_000_000) throw new Error('Stock SVG output exceeds limit')
process.stdout.write(png)

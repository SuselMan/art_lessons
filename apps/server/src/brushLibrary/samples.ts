import { createHash } from 'node:crypto'
import { existsSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { previewResource } from './previewFiles.js'
import { readFile } from './brushLibrary.js'
import { boundedRead } from './storage.js'
import { chromium, type Browser } from 'playwright'
import { BRUSH_SAMPLE_VERSION, NATIVE_BRUSH_SAMPLE_VERSION, brushAssetIds, type BrushLibrary, type ImportedBrush } from '@grafetto/shared'
import { BrushStorage, empty } from './storage.js'
import { brushContentHash, brushReference } from './contentAddressing.js'
export const sampleKey = (brush: ImportedBrush | string): string => createHash('sha256').update((typeof brush === 'string' ? NATIVE_BRUSH_SAMPLE_VERSION : BRUSH_SAMPLE_VERSION) + ':' + (typeof brush === 'string' ? 'native:' + brush : brushContentHash(brush))).digest('hex')
export class BrushSamples {
  private queue: Array<{ library: BrushLibrary; reference: string; key: string }> = []
  private pending = new Set<string>()
  private failed = new Set<string>()
  private browser: Browser | undefined
  private task: Promise<void> | undefined
  private closed = false
  constructor(readonly storage: BrushStorage, readonly url: string | undefined, readonly report: (error: unknown) => void) {
    if (url) { const target = new URL(url); if (!['http:', 'https:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw Error('Brush preview renderer must be loopback') }
  }
  path(key: string): string { if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid preview key'); return join(this.storage.root, 'previews', key + '.png') }
  available(key: string): boolean {
    const target = this.path(key)
    if (existsSync(target)) return true
    const seed = process.env.GRAFETTO_BRUSH_PREVIEW_SEED_DIR
    if (!seed || !existsSync(join(seed, key + '.png'))) return false
    const bytes = boundedRead(join(seed, key + '.png'), 1024 * 1024)
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid bundled sample')
    this.storage.ensureCapacity(bytes.length)
    writeFileSync(target + '.writing', bytes, { mode: 0o600 }); renameSync(target + '.writing', target)
    return true
  }
  enqueue(library: BrushLibrary, priority = false): void {
    if (!this.url || this.closed) return
    for (const brush of library.brushes) {
      if (brush.archived) continue
      const key = sampleKey(brush)
      if (this.available(key) || this.pending.has(key) || this.failed.has(key)) continue
      const used = new Set(brushAssetIds(brush.descriptor))
      this.pending.add(key)
      this.queue.push({ library: { schemaVersion: 1, brushes: [brush], assets: library.assets.filter(a => used.has(a.id)), skipped: [] }, reference: brushReference(brush), key })
    }
    for (const reference of ['pencil', 'liner', 'marker', 'charcoal', 'brushPen', 'eraser', 'smudge']) {
      const key = sampleKey(reference)
      if (this.available(key) || this.pending.has(key) || this.failed.has(key)) continue
      this.pending.add(key); this.queue.push({ library: empty(), reference, key })
    }
    const preferred = new Set(priority ? library.brushes.map(brushReference) : [])
    const weight = (reference: string) => preferred.has(reference) ? 0 : reference.startsWith('brush:') ? 2 : 1
    this.queue.sort((a, b) => weight(a.reference) - weight(b.reference))
    if (!this.task && this.queue.length) this.task = this.drain().finally(() => { this.task = undefined })
  }
  private async drain(): Promise<void> {
    try {
      this.browser = await chromium.launch({ headless: true, executablePath: process.env.GRAFETTO_BRUSH_CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
      while (!this.closed && this.queue.length) {
        const item = this.queue.shift()!
        const context = await this.browser.newContext({ viewport: { width: 640, height: 240 }, deviceScaleFactor: 1 })
        const watchdog = setTimeout(() => { void context.close() }, 45_000)
        try {
          const assetDir = process.env.GRAFETTO_BRUSH_PREVIEW_ASSET_DIR
          if (assetDir) await context.route('**/*', async route => {
            if (route.request().method() !== 'GET' || new URL(route.request().url()).origin !== new URL(this.url!).origin) { await route.abort(); return }
            const resource = previewResource(assetDir, route.request().url())
            if (!resource) { await route.fulfill({ status: 404, body: '' }); return }
            try { await route.fulfill({ status: 200, contentType: resource.contentType, body: await readFile(resource.file, 8 * 1024 * 1024) }) }
            catch { await route.fulfill({ status: 404, body: '' }) }
          })
          const page = await context.newPage()
          await page.goto(new URL(assetDir ? '/brush-preview.html' : '/brush-preview-renderer', this.url!).href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          await page.waitForFunction(() => typeof (window as unknown as { renderGrafettoBrushSample?: unknown }).renderGrafettoBrushSample === 'function', undefined, { timeout: 15_000 })
          const assets = Object.fromEntries(item.library.assets.map(a => [a.id, this.storage.asset(a.id.slice(6), a.size).toString('base64')]))
          const png = await page.evaluate(async input => {
            const host = window as unknown as { renderGrafettoBrushSample: (value: typeof input) => Promise<string> }
            return host.renderGrafettoBrushSample(input)
          }, { library: item.library, reference: item.reference, assets })
          if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) || png.length > 1024 * 1024) throw Error('Invalid generated preview')
          const bytes = Buffer.from(png.slice(png.indexOf(',') + 1), 'base64')
          this.storage.ensureCapacity(bytes.length)
          const path = this.path(item.key), temporary = path + '.writing'
          writeFileSync(temporary, bytes, { mode: 0o600 }); renameSync(temporary, path)
        } catch (error) { if (!this.closed) { this.failed.add(item.key); this.report(error) } }
        finally { clearTimeout(watchdog); this.pending.delete(item.key); await context.close().catch(() => {}) }
      }
    } catch (error) { if (!this.closed) this.report(error) }
    finally { await this.browser?.close().catch(() => {}); this.browser = undefined; this.queue = []; this.pending.clear() }
  }
  async close(): Promise<void> { this.closed = true; await this.browser?.close().catch(() => {}); await this.task }
}

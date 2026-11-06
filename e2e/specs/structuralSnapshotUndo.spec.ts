import { expect, test } from '@playwright/test'
import type { PencilEngine, PencilEngineOptions } from '../../apps/web/src/engine'
import type { Operation } from '../../packages/shared/src/index'
import { androidPage } from '../support/androidPage'

declare global { interface Window { __structuralSnapshotCase?: { kind: 'merge' | 'delete'; evict: boolean } } }
async function structuralSnapshotCase() {
  const spec = window.__structuralSnapshotCase!, path = '/src/engine/index.ts', codecPath = '/src/engine/snapshots.ts'
  const { PencilEngine: Engine } = await import(/* @vite-ignore */ path) as { PencilEngine: new (canvas: HTMLCanvasElement, options: PencilEngineOptions) => PencilEngine }
  const { decodeLayerTiles } = await import(/* @vite-ignore */ codecPath) as typeof import('../../apps/web/src/engine/snapshots')
  const make = (userId: string) => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256
    canvas.style.width = '256px'; canvas.style.height = '256px'; document.body.append(canvas)
    const engine = new Engine(canvas, { userId, pageWidth: 256, pageHeight: 256 })
    engine.setBaseLayers(['L', 'S']); engine.setActiveLayer('L')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }, { id: 'S', opacity: 1 }])
    return { canvas, engine }
  }
  const source = make('author'), reader = make('reader')
  try {
    await source.engine.paperReady(); await reader.engine.paperReady()
    source.engine.appendOperation({ id: 'covered', type: 'stroke', seq: 100, timestamp: 100, userId: 'author', layerId: 'L',
      tool: 'pencil', preset: '6B', color: [.1, .2, .3], dabs: [80, 90, 100, 110].map((x, i) => ({ x, y: 80 + i * 5,
        size: 30, pressure: .9, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: i * 8 })) }, 'remote')
    const original = source.engine.bakeNetworkSnapshot('L')
    if (!original) throw new Error('No source snapshot')
    const tiles = decodeLayerTiles(original, 0).tiles
    let painted = 0
    for (const tile of tiles) for (let i = 3; i < tile.pixels.length; i += 4) if (tile.pixels[i]) painted++
    reader.engine.restoreLayerFromSnapshot('L', tiles, 100)
    const seam = reader.engine as unknown as { _checkpoints: { setBudget(bytes: number): void; hasSnapshotFor(id: string): boolean }; _layers: Map<string, unknown> }
    seam._checkpoints.setBudget(spec.evict ? 0 : 8 * 1024 * 1024)
    const pinnedSurvivesBudget = seam._checkpoints.hasSnapshotFor('L')
    const structural: Operation = spec.kind === 'delete'
      ? { id: 'structure', type: 'layer_delete', seq: 101, timestamp: 101, userId: 'author', layerIds: ['L'] }
      : { id: 'structure', type: 'layer_merge', seq: 101, timestamp: 101, userId: 'author', layerId: 'M', name: 'Merged',
        sources: [{ id: 'L', opacity: 1 }, { id: 'S', opacity: 1 }], parentId: null, index: 0 }
    reader.engine.appendOperation(structural, 'remote')
    const checkpointAfterDestroy = seam._checkpoints.hasSnapshotFor('L')
    reader.engine.appendOperation({ id: 'undo', type: 'operation_undo', seq: 102, timestamp: 102, userId: 'author', targetOpId: 'structure' }, 'remote')
    const restoredLayers = [...seam._layers.keys()].sort()
    const candidate = reader.engine.bakeNetworkSnapshot('L')
    const diff = (bytes: Uint8Array | null) => {
      if (!bytes) return null
      const after = decodeLayerTiles(bytes, 0).tiles
      if (after.length !== tiles.length) throw new Error('Tile count changed')
      let changed = 0
      for (let t = 0; t < tiles.length; t++) {
        const a = tiles[t], b = after[t]
        if (a.width !== b.width || a.height !== b.height || a.originX !== b.originX || a.originY !== b.originY) throw new Error('Tile geometry changed')
        for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) changed++
      }
      return changed
    }
    const changed = diff(candidate)
    // An evicted base may be incomplete locally; it must never become coverage.
    // Reinstalling the real base must also make this refusal recoverable.
    reader.engine.restoreLayerFromSnapshot('L', tiles, 100)
    const repaired = reader.engine.bakeNetworkSnapshot('L'), repairedChanged = diff(repaired)
    const gl = reader.canvas.getContext('webgl')!, ext = gl.getExtension('WEBGL_debug_renderer_info')
    return { ...spec, painted, pinnedSurvivesBudget, checkpointAfterDestroy, restoredLayers, blocked: candidate === null,
      changed, repairedBlocked: repaired === null, repairedChanged, historicalStrokeRows: reader.engine.getOperations().filter(op => op.type === 'stroke').length,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : 'unknown' }
  } finally {
    reader.canvas.remove(); reader.engine.destroy(); source.canvas.remove(); source.engine.destroy()
  }
}
for (const device of ['chromium', 'samsung'] as const) test(`structural snapshot undo and eviction on ${device}`, async ({ page }) => {
  test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires paired Samsung')
  test.setTimeout(180_000); await page.goto('/')
  let mobile: Awaited<ReturnType<typeof androidPage>> | undefined
  const evaluate = async <T>(fn: () => T): Promise<Awaited<T>> => mobile ? await mobile.evaluate(fn) : await page.evaluate(fn)
  try {
    if (device === 'samsung') mobile = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/?qa=structural-snapshot-522`)
    for (const kind of ['delete', 'merge'] as const) for (const evict of [false, true]) {
      const spec = { kind, evict }
      if (mobile) await mobile.call('Runtime.evaluate', { expression: `window.__structuralSnapshotCase=${JSON.stringify(spec)}` })
      else await page.evaluate(value => { window.__structuralSnapshotCase = value }, spec)
      const result = await evaluate(structuralSnapshotCase)
      console.log('QA522 structural snapshot:', JSON.stringify({ device, ...result }))
      expect.soft(result.painted).toBeGreaterThan(100)
      expect.soft(result.pinnedSurvivesBudget).toBe(true)
      expect.soft(result.checkpointAfterDestroy).toBe(!evict)
      expect.soft(result.restoredLayers).toEqual(['L', 'S'])
      expect.soft(result.historicalStrokeRows).toBe(0)
      expect.soft(result.blocked).toBe(evict)
      expect.soft(result.changed).toBe(evict ? null : 0)
      expect.soft(result.repairedBlocked).toBe(false)
      expect.soft(result.repairedChanged).toBe(0)
    }
  } finally { await mobile?.close() }
})

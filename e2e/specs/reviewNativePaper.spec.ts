import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { PencilEngineOptions, PencilEngine } from '../../apps/web/src/engine'
import type { StrokeOperation } from '../../packages/shared/src/index'

async function nativePaperCase() {
  const path = '/src/engine/index.ts', codecPath = '/src/engine/snapshots.ts'
  const { PencilEngine: Engine, nativePaperPreset } = await import(/* @vite-ignore */ path) as typeof import('../../apps/web/src/engine')
  const { decodeLayerTiles } = await import(/* @vite-ignore */ codecPath) as typeof import('../../apps/web/src/engine/snapshots')
  const owned: { canvas: HTMLCanvasElement; engine: PencilEngine }[] = []
  const make = async (paperType: PencilEngineOptions['paper']) => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256
    document.body.append(canvas)
    const engine = new Engine(canvas, { userId: 'author', pageWidth: 256, pageHeight: 256, paper: paperType })
    owned.push({ canvas, engine }); engine.setBaseLayers(['L']); engine.setActiveLayer('L')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }]); await engine.paperReady()
    return engine
  }
  const pixels = (engine: PencilEngine) => {
    const bytes = engine.bakeNetworkSnapshot('L')
    return bytes ? decodeLayerTiles(bytes, 0).tiles.flatMap(t => Array.from(t.pixels)) : []
  }
  const difference = (a: number[], b: number[]) => a.length !== b.length ? -1 : a.reduce((n, value, i) => n + Number(value !== b[i]), 0)
  try {
    const results = []
    for (const tool of ['pencil', 'charcoal'] as const) {
      const raw = tool === 'pencil' ? '6B' : 'compressed:chisel'
      const fine = await make('fine'), flat = await make('flat'), legacy = await make('flat'), replay = await make('flat')
      const op: StrokeOperation = { id: 'grain-' + tool, type: 'stroke', seq: 1, timestamp: 1, userId: 'author', layerId: 'L', tool,
        preset: raw, color: [.1, .2, .3], dabs: Array.from({ length: 14 }, (_, i) => ({ x: 60 + i * 10, y: 100 + i % 3,
          size: 45, pressure: .85, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: i * 8 })) }
      const textured = { ...op, preset: nativePaperPreset(tool, 'flat', raw) }
      fine.appendOperation(op, 'remote'); legacy.appendOperation(op, 'remote'); flat.appendOperation(textured, 'remote')
      replay.appendOperation(textured, 'remote')
      const a = pixels(flat), b = pixels(fine), old = pixels(legacy)
      const snapshot = flat.bakeNetworkSnapshot('L')!
      const images: Record<string, string> = {}
      let blankPaperRange = -1
      for (const [name, engine] of Object.entries({ flat, fine, legacy })) {
        const blob = await engine.exportPNG()
        if (!blob) throw new Error('Missing native paper export')
        if (name === 'flat') {
          const bitmap = await createImageBitmap(blob), sample = document.createElement('canvas')
          sample.width = 20; sample.height = 20
          const context = sample.getContext('2d')!
          context.drawImage(bitmap, 0, 0); bitmap.close()
          const rgba = context.getImageData(0, 0, 20, 20).data
          blankPaperRange = Math.max(...[0, 1, 2].map(channel => {
            const values = Array.from(rgba).filter((_, i) => i % 4 === channel)
            return Math.max(...values) - Math.min(...values)
          }))
        }
        const data = new Uint8Array(await blob.arrayBuffer())
        images[name] = btoa(Array.from(data, byte => String.fromCharCode(byte)).join(''))
      }
      const reader = await make('flat'); reader.restoreLayerFromSnapshot('L', decodeLayerTiles(snapshot, 0).tiles, 1)
      flat.appendOperation({ id: 'undo-' + tool, type: 'operation_undo', seq: 2, timestamp: 2, userId: 'author', targetOpId: op.id }, 'remote')
      const undone = pixels(flat).every((v, i) => i % 4 !== 3 || v === 0)
      flat.appendOperation({ id: 'redo-' + tool, type: 'operation_redo', seq: 3, timestamp: 3, userId: 'author', targetOpId: op.id }, 'remote')
      results.push({ tool, images, blankPaperRange, renderer: flat.gpuInfo().renderer, painted: a.filter((v, i) => i % 4 === 3 && v > 0).length, fineDifference: difference(a, b), legacyDifference: difference(a, old),
        replayDifference: difference(a, pixels(replay)), snapshotDifference: difference(a, pixels(reader)), undone, redoDifference: difference(a, pixels(flat)) })
      // Release each set before the next material; do not accumulate WebGL contexts.
      for (const item of owned.splice(0)) { item.canvas.remove(); item.engine.destroy() }
    }
    return results
  } finally { for (const item of owned) { item.canvas.remove(); item.engine.destroy() } }
}

test('Flat native tooth equals Fine, preserves legacy strokes, replay, snapshot and undo', async ({ page }, info) => {
  test.setTimeout(120_000); await page.goto('/create')
  const results = await page.evaluate(nativePaperCase)
  console.log('QA857', JSON.stringify(results.map(({ images: _images, ...metrics }) => metrics)))
  for (const result of results) for (const [name, image] of Object.entries(result.images)) await writeFile(info.outputPath(`${result.tool}-${name}.png`), Buffer.from(image, 'base64'))
  for (const result of results) {
    expect(result.blankPaperRange).toBe(0)
    expect(result.painted).toBeGreaterThan(100)
    expect(result.fineDifference).toBe(0)
    expect(result.legacyDifference).toBeGreaterThan(100)
    expect(result.replayDifference).toBe(0)
    expect(result.snapshotDifference).toBe(0)
    expect(result.undone).toBe(true)
    expect(result.redoDifference).toBe(0)
  }
})

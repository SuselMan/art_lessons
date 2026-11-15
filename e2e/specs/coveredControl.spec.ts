import { expect, test } from '@playwright/test'
import { androidPage } from '../support/androidPage'
import type { PencilEngine, PencilEngineOptions } from '../../apps/web/src/engine'
import type { Operation } from '../../packages/shared/src/index'

// Exercise partial historical hydration with an actual baked WebGL bitmap.
async function coveredScenario() {
  const path = '/src/engine/index.ts'
  const snapshotPath = '/src/engine/snapshots.ts'
  const { PencilEngine: Engine } = await import(/* @vite-ignore */ path) as { PencilEngine: new (canvas: HTMLCanvasElement, options: PencilEngineOptions) => PencilEngine }
  const { decodeLayerTiles } = await import(/* @vite-ignore */ snapshotPath) as typeof import('../../apps/web/src/engine/snapshots')
  const canvases = [document.createElement('canvas'), document.createElement('canvas')]
  for (const canvas of canvases) { canvas.width = 128; canvas.height = 128; canvas.style.width = '128px'; canvas.style.height = '128px'; document.body.append(canvas) }
  const engines = canvases.map(canvas => new Engine(canvas, { userId: 'A', pageWidth: 128, pageHeight: 128 }))
  const [source, reader] = engines
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  try {
    await Promise.all(engines.map(engine => engine.paperReady()))
    for (const engine of engines) { engine.setBaseLayers(['L']); engine.setCompositeOrder([{ id: 'L', opacity: 1 }]) }
    const base: Operation = { id: 'base', type: 'stroke', userId: 'B', timestamp: 1, seq: 1, layerId: 'L', tool: 'pencil', preset: 'HB', color: [0, 0, 0],
      dabs: [{ x: 32, y: 32, size: 32, pressure: 1, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }] }
    const target: Operation = { ...base, id: 'target', userId: 'A', timestamp: 3, seq: 3,
      dabs: [{ ...base.dabs![0], x: 96, y: 96 }] }
    const undo: Operation = { id: 'covered-undo', type: 'operation_undo', userId: 'A', timestamp: 4, seq: 4, targetOpId: target.id }
    for (const op of [base, target, undo]) source.appendOperation(op, 'remote')
    const blob = source.bakeNetworkSnapshot('L')!
    reader.restoreLayerFromSnapshot('L', decodeLayerTiles(blob, 0).tiles, 5)
    reader.setCompositeOrder([{ id: 'L', opacity: 1 }])
    await frame()
    const darkness = () => { const rgb = reader.pickColor(32, 32)!; return 1 - (rgb[0] + rgb[1] + rgb[2]) / 3 }
    const before = darkness()
    reader.absorbHistoricalOperations([target])
    reader.absorbHistoricalOperations([undo])
    await frame()
    const after = darkness()
    const oldPending = reader.pendingSnapshotHistoryRepairs()
    const oldPublishable = reader.bakeNetworkSnapshot('L') !== null
    reader.absorbHistoricalOperations([base])
    reader.appendOperation({ id: 'newer-revoke', type: 'operation_revoke', userId: 'A', targetOpId: base.id, timestamp: 6, seq: 6 }, 'remote')
    const newPending = reader.pendingSnapshotHistoryRepairs()
    const newPublishable = reader.bakeNetworkSnapshot('L') !== null
    return { before, after, oldPending, oldPublishable, newPending, newPublishable }
  } finally { for (const engine of engines) engine.destroy(); for (const canvas of canvases) canvas.remove() }
}

for (const device of ['chromium', 'samsung'] as const) {
  test(`baked control preserves its snapshot on ${device}`, async ({ page }) => {
    test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires the paired Samsung')
    await page.goto('/')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let android: Awaited<ReturnType<typeof androidPage>> | undefined
    try {
      let evaluate = async () => page.evaluate(coveredScenario)
      if (device === 'samsung') {
        android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/?qa=covered-control-761`)
        evaluate = async () => await android!.evaluate(coveredScenario)
      }
      const result = await evaluate()
      console.log('Covered control:', JSON.stringify({ device, ...result }))
      expect(result.before).toBeGreaterThan(0.08)
      expect(result.after).toBeCloseTo(result.before, 3)
      expect(result.oldPending).toEqual([])
      expect(result.oldPublishable).toBe(true)
      expect(result.newPending).toEqual([{ layerId: 'L', beforeSeq: 6 }])
      expect(result.newPublishable).toBe(false)
      expect(errors).toEqual([])
    } finally { await android?.close() }
  })
}

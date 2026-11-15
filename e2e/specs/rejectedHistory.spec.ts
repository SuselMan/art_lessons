import { expect, test } from '@playwright/test'
import { androidPage } from '../support/androidPage'
import type { PencilEngine, PencilEngineOptions } from '../../apps/web/src/engine'
import type { Operation } from '../../packages/shared/src/index'

// Standalone real WebGL engine: inject the terminal refusal at its public API
// boundary, without pretending the server accepted these synthetic operations.
async function rejectionScenario() {
  const path = '/src/engine/index.ts'
  const { PencilEngine: Engine } = await import(/* @vite-ignore */ path) as { PencilEngine: new (canvas: HTMLCanvasElement, options: PencilEngineOptions) => PencilEngine }
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128
  canvas.style.width = '128px'; canvas.style.height = '128px'
  document.body.append(canvas)
  const engine = new Engine(canvas, { userId: 'A', pageWidth: 128, pageHeight: 128 })
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  try {
    await engine.paperReady()
    engine.appendOperation({ id: 'layer', type: 'layer_add', userId: 'B', timestamp: 1, seq: 2, layerId: 'L', name: 'L' }, 'remote')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    const stroke: Operation = { id: 'stroke', type: 'stroke', userId: 'A', timestamp: 2, seq: 3, layerId: 'L', tool: 'pencil', preset: 'HB', color: [0, 0, 0],
      dabs: [{ x: 64, y: 64, size: 32, pressure: 1, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }] }
    engine.appendOperation(stroke, 'remote')
    const darkness = () => { const rgb = engine.pickColor(64, 64)!; return 1 - (rgb[0] + rgb[1] + rgb[2]) / 3 }
    await frame()
    const before = darkness()
    engine.appendOperation({ id: 'rejected-revoke', type: 'operation_revoke', userId: 'A', targetOpId: 'stroke', timestamp: 3 })
    await frame()
    const revoked = darkness()
    const repaired = engine.discardOperation('rejected-revoke')
    await frame()
    const afterRefusal = darkness()
    engine.absorbHistoricalOperations([{ id: 'older', type: 'layer_add', userId: 'B', timestamp: 0, seq: 1, layerId: 'K', name: 'K' }])
    await frame()
    const afterHistory = darkness()
    const ids = engine.getOperations().map(op => op.id)
    engine.confirmOperation('rejected-revoke', 4)
    await frame()
    const afterAuthoritativeAck = darkness()
    return { before, revoked, repaired, afterRefusal, afterHistory, afterAuthoritativeAck, ids }
  } finally { engine.destroy(); canvas.remove() }
}

for (const device of ['chromium', 'samsung'] as const) {
  test(`rejected control stays inert after backfill on ${device}`, async ({ page }) => {
    test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires the paired Samsung')
    await page.goto('/')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let android: Awaited<ReturnType<typeof androidPage>> | undefined
    try {
      let evaluate = async () => page.evaluate(rejectionScenario)
      if (device === 'samsung') {
        android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/?qa=rejected-history-775`)
        evaluate = async () => await android!.evaluate(rejectionScenario)
      }
      const result = await evaluate()
      console.log('Rejected history:', JSON.stringify({ device, ...result }))
      expect(result.before).toBeGreaterThan(0.08)
      expect(result.revoked).toBeLessThan(result.before / 2)
      expect(result.repaired).toBe(true)
      expect(result.afterRefusal).toBeCloseTo(result.before, 3)
      expect(result.afterHistory).toBeCloseTo(result.before, 3)
      expect(result.ids).toContain('stroke')
      expect(result.ids).not.toContain('rejected-revoke')
      expect(result.afterAuthoritativeAck).toBeLessThan(result.before / 2)
      expect(errors).toEqual([])
    } finally { await android?.close() }
  })
}

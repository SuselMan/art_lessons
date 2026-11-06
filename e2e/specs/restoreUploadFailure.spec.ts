import { expect, test } from '@playwright/test'
import { androidPage } from '../support/androidPage'
import type { PencilEngine, PencilEngineOptions } from '../../apps/web/src/engine'

// Inject the driver's error flag after a real texture upload. This exercises
// acceptance and recovery on actual WebGL without exhausting device memory.
async function uploadFailureScenario() {
  const path = '/src/engine/index.ts'
  const { PencilEngine: Engine } = await import(/* @vite-ignore */ path) as { PencilEngine: new (canvas: HTMLCanvasElement, options: PencilEngineOptions) => PencilEngine }
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128; document.body.append(canvas)
  const engine = new Engine(canvas, { userId: 'A', pageWidth: 128, pageHeight: 128 })
  const gl = canvas.getContext('webgl')!
  const original = gl.getError.bind(gl)
  try {
    await engine.paperReady()
    engine.setBaseLayers(['L'])
    const tile = { originX: 0, originY: 0, width: 128, height: 128, pixels: new Uint8Array(128 * 128 * 4).fill(200) }
    let calls = 0
    gl.getError = () => ++calls === 2 ? 0x0505 : original()
    let message = ''
    try { await engine.restoreLayerFromSnapshot('L', [tile], 100) } catch (error) { message = (error as Error).message }
    gl.getError = original
    const blocked = engine.bakeNetworkSnapshot('L') === null
    const failedAudit = engine.takeSnapshotRestoreAudit()
    await engine.restoreLayerFromSnapshot('L', [tile], 100)
    const recovered = engine.bakeNetworkSnapshot('L') !== null
    const retryAudit = engine.takeSnapshotRestoreAudit()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return { message, blocked, failedAudit, recovered, retryAudit,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : 'unknown' }
  } finally { gl.getError = original; engine.destroy(); canvas.remove() }
}

for (const device of ['chromium', 'samsung'] as const) {
  test(`failed snapshot upload stays unpublished on ${device}`, async ({ page }) => {
    test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires the paired Samsung')
    await page.goto('/')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let android: Awaited<ReturnType<typeof androidPage>> | undefined
    try {
      let evaluate = async () => page.evaluate(uploadFailureScenario)
      if (device === 'samsung') {
        android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/?qa=restore-oom-474`)
        evaluate = async () => await android!.evaluate(uploadFailureScenario)
      }
      const result = await evaluate()
      console.log('Restore upload failure:', JSON.stringify({ device, ...result }))
      expect(result.message).toBe('Snapshot upload failed: GL error 0x505')
      expect(result.blocked).toBe(true)
      expect(result.failedAudit).toMatchObject([{ layerId: 'L', glError: 0x0505 }])
      expect(result.recovered).toBe(true)
      expect(result.retryAudit).toMatchObject([{ layerId: 'L', glError: 0 }])
      if (device === 'samsung') expect(result.gpu).toMatch(/Adreno/)
      expect(errors).toEqual([])
    } finally { await android?.close() }
  })
}

import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

/** Synthetic oversized mixer regression. Start only against a frozen QA build.
 * QA_OUTPUT=/private/evidence QA_URL=http://127.0.0.1:5386 npx tsx e2e/brushLargeMixerGPUQA.ts */
async function main() {
  const output = process.env.QA_OUTPUT
  if (!output) throw new Error('QA_OUTPUT must point to a private evidence directory')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  try {
    const context = await browser.newContext({ baseURL: process.env.QA_URL ?? 'http://127.0.0.1:5386', viewport: { width: 1024, height: 640 } })
    try {
      await context.addInitScript('globalThis.__name = (fn) => fn')
      const page = await context.newPage()
      const pageErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto('/create')
      await page.locator('form input[type=text]').first().waitFor()
      const result = await page.evaluate(async () => {
        const enginePath = '/src/engine/index.ts', registryPath = '/src/engine/brushLibrary.ts'
        const { PencilEngine } = await import(enginePath)
        const registry = await import(registryPath)
        const pixels = new Uint8Array(64 * 64).fill(255)
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))].map(v => v.toString(16).padStart(2, '0')).join('')
        const id = 'imported-000000000000000000000806', assetId = `asset:${hash}`
        const descriptor = {
          id, version: 1, model: 'mixer', category: 'paint',
          tip: { kind: 'bitmap', mask: assetId, hardness: 1, aspect: 1, rotation: 'fixed', angle: Math.PI / 4 },
          paperInteraction: 0, spacing: .05, flow: 1, flowPer: 'stamp',
          sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]], pressureSmoothingPx: 0, opacity: 1,
          mixer: { load: 1, pickup: 0, strength: 1 },
          behavior: {
            version: 2,
            rendering: { mode: 'buildUp', blendMode: 'normal', wetEdges: 0, burntEdges: 0, burntEdgesMode: 'multiply' },
            wetMix: { charge: 1, dilution: 0, attack: 1, pull: 0, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0 },
          },
        }
        registry.installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Synthetic oversized square', source: 'qa', warnings: [], descriptor }], assets: [{ id: assetId, size: 64, file: `${hash}.bin` }], skipped: [] })
        registry.installBrushPixels(assetId, pixels)
        const canvas = document.createElement('canvas')
        canvas.width = 1024; canvas.height = 1024
        canvas.style.cssText = 'position:fixed;left:10000px;width:1024px;height:1024px'
        document.body.append(canvas)
        const engine = new PencilEngine(canvas, { pageWidth: 1024, pageHeight: 1024, userId: 'large-mixer-probe' })
        try {
          await engine.paperReady()
          engine.setBaseLayers(['ink']); engine.setActiveLayer('ink'); engine.setCompositeOrder([{ id: 'ink', opacity: 1 }])
          const gl = canvas.getContext('webgl')!
          const glErrors: Array<{ stage: string; errors: number[] }> = []
          const checkGL = (stage: string) => {
            const errors: number[] = []
            for (let i = 0; i < 16; i++) { const error = gl.getError(); if (!error) break; errors.push(error) }
            glErrors.push({ stage, errors })
          }
          checkGL('initialization')
          let serial = 0
          const append = (strokeId: string, x: number, opacity: number, end: boolean) => {
            serial++
            engine.appendOperation({ id: `large-${serial}`, type: 'stroke', userId: 'large-mixer-probe', timestamp: serial, seq: serial, strokeId, strokeEnd: end, tool: 'digitalBrush', preset: `brush:${id}@1`, layerId: 'ink', color: [0, 0, 0], dabs: [{ x, y: 512, size: 600, pressure: 1, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: Math.PI / 4, opacity, t: serial * 8 }] }, 'remote')
            checkGL(`operation-${serial}-opacity-${opacity}`)
          }
          // The zero-strength dab refreshes the reservoir but skips transfer.
          // Its released old imprint is first in the FIFO scratch pool, while
          // u_carried may still point at it. The next gesture gathers into it.
          append('oversized-first', 512, 1, false)
          append('oversized-first', 513, 0, true)
          append('oversized-second', 512, 1, true)
          const blob = await engine.exportPNG(true)
          if (!blob) throw new Error('Transparent PNG export missing')
          const bitmap = await createImageBitmap(blob)
          const decoded = document.createElement('canvas')
          decoded.width = bitmap.width; decoded.height = bitmap.height
          const drawing = decoded.getContext('2d')!
          drawing.drawImage(bitmap, 0, 0); bitmap.close()
          const image = drawing.getImageData(0, 0, decoded.width, decoded.height).data
          const alpha = (x: number, y: number) => image[(y * decoded.width + x) * 4 + 3]
          let minX = 1024, minY = 1024, maxX = -1, maxY = -1, painted = 0, outsideQuad = 0
          const cos = Math.SQRT1_2
          for (let y = 0; y < decoded.height; y++) {
            for (let x = 0; x < decoded.width; x++) {
              if (alpha(x, y) <= 3) continue
              painted++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
              const dx = x + .5 - 512, dy = y + .5 - 512
              if (Math.abs((dx + dy) * cos) > 301 || Math.abs((-dx + dy) * cos) > 301) outsideQuad++
            }
          }
          checkGL('export')
          const png = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          return { width: decoded.width, height: decoded.height, bounds: { minX, minY, maxX, maxY }, bboxWidth: maxX - minX + 1, bboxHeight: maxY - minY + 1, painted, outsideQuad, outsideOldPatch: { right: alpha(850, 512), bottom: alpha(512, 850), left: alpha(174, 512), top: alpha(512, 174) }, outsideQuadCornerAlpha: alpha(850, 850), glErrors, png }
        } finally { engine.destroy(); canvas.remove() }
      })
      const { png, ...metrics } = result
      // Evidence survives assertions, including a failed geometry or GL check.
      await writeFile(`${output}/large-mixer.png`, Buffer.from(png.split(',')[1], 'base64'))
      await writeFile(`${output}/large-mixer.json`, JSON.stringify({ ...metrics, pageErrors }, null, 2))
      console.log('Oversized mixer', metrics)
      expect(result.width).toBe(1024); expect(result.height).toBe(1024)
      expect(result.glErrors.every(stage => stage.errors.length === 0)).toBe(true)
      expect(result.bboxWidth).toBeGreaterThanOrEqual(800); expect(result.bboxHeight).toBeGreaterThanOrEqual(800)
      for (const value of Object.values(result.outsideOldPatch)) expect(value).toBeGreaterThan(3)
      expect(result.outsideQuad).toBe(0); expect(result.outsideQuadCornerAlpha).toBe(0)
      expect(pageErrors).toEqual([])
    } finally { await context.close() }
  } finally { await browser.close() }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })

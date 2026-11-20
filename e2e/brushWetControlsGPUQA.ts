import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

/** Semantic tests for our shared contract, not reverse-engineered vendor kernels.
 * Blur is deliberately excluded: a meaningful oracle needs a separately controlled
 * carried-colour boundary and cannot assume exact proprietary mixing weights. */
async function main() {
  const output = process.env.QA_OUTPUT
  if (!output) throw new Error('QA_OUTPUT must be a private evidence directory')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  try {
    const context = await browser.newContext({ baseURL: process.env.QA_URL ?? 'http://127.0.0.1:5386', viewport: { width: 640, height: 640 } })
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
        const pixels = Uint8Array.from({ length: 64 }, (_, index) => ((index % 8 + Math.floor(index / 8)) % 2 ? 192 : 64))
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))].map(value => value.toString(16).padStart(2, '0')).join('')
        const assetId = `asset:${hash}`, size = 512
        const glErrors: number[] = []
        let serial = 0
        const render = async (wetEdges: number, burntEdges: number, grade?: number) => {
          const id = `imported-${(++serial).toString(16).padStart(24, '0')}`
          const descriptor = {
            id, version: 1, model: 'stamp', category: 'paint',
            tip: { kind: 'round', hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
            paperInteraction: 0, spacing: .05, flow: 1, flowPer: 'stamp',
            sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]], pressureSmoothingPx: 0, opacity: 1,
            ...(grade === undefined ? {} : { texture: { id: assetId, periodPx: 32, strength: 1 } }),
            behavior: {
              version: 2,
              rendering: { mode: 'buildUp', blendMode: 'normal', wetEdges, burntEdges, burntEdgesMode: 'multiply' },
              ...(grade === undefined ? {} : {
                grain: { mode: 'canvas', movement: 0, zoom: 1, rotation: 0, offsetJitter: false, brightness: 0, contrast: 0, depthMinimum: 0, depthJitter: 0, blendMode: 'multiply' },
                // Grade changes texture tone in the common stamp shader; this
                // fixture intentionally isolates it from pigment pickup/blur.
                wetMix: { charge: 0, dilution: 0, attack: 0, pull: 0, grade, blur: 0, blurJitter: 0, wetnessJitter: 0 },
              }),
            },
          }
          registry.installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own wet-control probe', source: 'qa', warnings: [], descriptor }], assets: [{ id: assetId, size: 8, file: `${hash}.bin` }], skipped: [] })
          registry.installBrushPixels(assetId, pixels)
          const canvas = document.createElement('canvas')
          canvas.width = size; canvas.height = size
          canvas.style.cssText = `position:fixed;left:10000px;width:${size}px;height:${size}px`
          document.body.append(canvas)
          const engine = new PencilEngine(canvas, { pageWidth: size, pageHeight: size, userId: 'wet-controls-probe' })
          try {
            await engine.paperReady()
            engine.setBaseLayers(['ink']); engine.setActiveLayer('ink'); engine.setCompositeOrder([{ id: 'ink', opacity: 1 }])
            engine.appendOperation({ id: `op-${serial}`, type: 'stroke', userId: 'wet-controls-probe', timestamp: serial, seq: 1, strokeId: `gesture-${serial}`, strokeEnd: true, tool: 'digitalBrush', preset: `brush:${id}@1`, layerId: 'ink', color: [.25, .5, .75], dabs: [{ x: 256, y: 256, size: 100, pressure: 1, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }] }, 'remote')
            const blob = await engine.exportPNG(true)
            if (!blob) throw new Error('PNG export missing')
            const url = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error)
              reader.readAsDataURL(blob)
            })
            const image = new Image()
            image.src = url; await image.decode()
            if (image.width !== size || image.height !== size) throw new Error(`Unexpected export ${image.width}x${image.height}`)
            const decoded = document.createElement('canvas')
            decoded.width = size; decoded.height = size
            const drawing = decoded.getContext('2d')!
            drawing.drawImage(image, 0, 0)
            glErrors.push(canvas.getContext('webgl')!.getError())
            return drawing.getImageData(0, 0, size, size).data
          } finally { engine.destroy(); canvas.remove() }
        }
        const plain = await render(0, 0), wet = await render(1, 0), burnt = await render(0, 1)
        let wetAlphaChanged = 0, wetHalo = 0, wetColorMax = 0, wetColorSamples = 0
        let burntAlphaMax = 0, burntDarkened = 0, burntBrightened = 0
        for (let index = 0; index < plain.length; index += 4) {
          const a = plain[index + 3], w = wet[index + 3], b = burnt[index + 3]
          if (a !== w) wetAlphaChanged++
          if (a === 0 && w > 3) wetHalo++
          // Canvas2D exposes straight RGB. Avoid low-alpha quantization, where
          // unpremultiplication amplifies one-byte storage rounding errors.
          if (a >= 128 && w >= 128) {
            wetColorSamples++
            for (let channel = 0; channel < 3; channel++) wetColorMax = Math.max(wetColorMax, Math.abs(plain[index + channel] - wet[index + channel]))
          }
          burntAlphaMax = Math.max(burntAlphaMax, Math.abs(a - b))
          if (a >= 128) {
            let darker = false, brighter = false
            for (let channel = 0; channel < 3; channel++) {
              const delta = burnt[index + channel] - plain[index + channel]
              if (delta < -3) darker = true
              if (delta > 3) brighter = true
            }
            if (darker) burntDarkened++
            if (brighter) burntBrightened++
          }
        }
        const grades = [await render(0, 0, -1), await render(0, 0, 0), await render(0, 0, 1)]
        const samples = grades.map(image => {
          const values: number[] = []
          // Interior rectangle removes the shape edge from texture statistics.
          for (let y = 236; y < 276; y++) for (let x = 236; x < 276; x++) values.push(image[(y * size + x) * 4 + 3])
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length
          const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
          return { values, mean, variance }
        })
        const covariance = samples[0].values.reduce((sum, value, index) => sum + (value - samples[0].mean) * (samples[1].values[index] - samples[1].mean), 0) / samples[0].values.length
        return {
          glErrors,
          wetEdges: { alphaChanged: wetAlphaChanged, haloPixels: wetHalo, colorMax: wetColorMax, colorSamples: wetColorSamples },
          burntEdges: { alphaMax: burntAlphaMax, darkenedPixels: burntDarkened, brightenedPixels: burntBrightened },
          grade: { means: samples.map(sample => sample.mean), variances: samples.map(sample => sample.variance), negativeZeroCovariance: covariance },
          limits: ['Tests shared Grafetto semantics, not Procreate kernels.', 'Blur/carried-colour boundary is not covered by this probe.'],
        }
      })
      await writeFile(`${output}/report.json`, JSON.stringify({ ...result, pageErrors }, null, 2))
      console.log(JSON.stringify(result, null, 2))
      expect(result.glErrors).toEqual(Array(6).fill(0))
      expect(result.wetEdges.alphaChanged).toBeGreaterThan(50)
      expect(result.wetEdges.haloPixels).toBeGreaterThan(10)
      expect(result.wetEdges.colorSamples).toBeGreaterThan(100)
      expect(result.wetEdges.colorMax).toBeLessThanOrEqual(2)
      expect(result.burntEdges.alphaMax).toBe(0)
      expect(result.burntEdges.darkenedPixels).toBeGreaterThan(10)
      expect(result.burntEdges.brightenedPixels).toBe(0)
      expect(result.grade.variances[0]).toBeLessThan(result.grade.variances[1] * .1)
      expect(result.grade.variances[2]).toBeGreaterThan(result.grade.variances[1] * 1.1)
      expect(result.grade.negativeZeroCovariance).toBeGreaterThanOrEqual(0)
      expect(pageErrors).toEqual([])
    } finally { await context.close() }
  } finally { await browser.close() }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })

import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

/** Standalone GPU probes; all masks are authored here, never vendor assets.
 * QA_OUTPUT=/private/path npx tsx e2e/brushEdgesGPUQA.ts */
async function main() {
  const output = process.env.QA_OUTPUT
  if (!output) throw new Error('QA_OUTPUT must point to a private evidence directory')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const reports: unknown[] = []
  const checks: Array<() => void> = []
  try {
    const context = await browser.newContext({ baseURL: process.env.QA_URL ?? 'http://127.0.0.1:5386', viewport: { width: 1024, height: 640 } })
    try {
      await context.addInitScript('globalThis.__name = (fn) => fn')
      const page = await context.newPage()
      const pageErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto('/create')
      await page.locator('form input[type=text]').first().waitFor()
      for (const model of ['stamp', 'mixer'] as const) {
        for (const tipKind of ['round', 'bitmap'] as const) {
          const result = await page.evaluate(async ({ model, tipKind }) => {
            const enginePath = '/src/engine/index.ts', registryPath = '/src/engine/brushLibrary.ts'
            const { PencilEngine } = await import(enginePath)
            const registry = await import(registryPath)
            const pixels = new Uint8Array(64 * 64).fill(255)
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))].map(value => value.toString(16).padStart(2, '0')).join('')
            const assetId = `asset:${hash}`
            const width = 1024, height = 512, radius = 96, centerY = 256
            const glErrors: number[] = []
            let serial = 0
            const render = async (bleed: number, pressure = 1, centerX = 256, angle = 0) => {
              const id = `imported-${((model === 'mixer' ? 200 : 0) + (tipKind === 'bitmap' ? 100 : 0) + ++serial).toString(16).padStart(24, '0')}`
              const descriptor = {
                id, version: 1, model, category: 'paint',
                tip: { kind: tipKind, ...(tipKind === 'bitmap' ? { mask: assetId } : {}), hardness: 1, aspect: 1, rotation: 'fixed', angle },
                paperInteraction: 0, spacing: .05, flow: 1, flowPer: 'stamp',
                sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]], pressureSmoothingPx: 0, opacity: 1,
                ...(model === 'mixer' ? { mixer: { load: 1, pickup: 0, strength: 1 } } : {}),
                behavior: {
                  version: 2, edgeBleed: { pressure: bleed, tilt: 0 },
                  rendering: { mode: 'buildUp', blendMode: 'normal', wetEdges: 0, burntEdges: 0, burntEdgesMode: 'multiply' },
                  ...(model === 'mixer' ? { wetMix: { charge: 1, dilution: 0, attack: 1, pull: 0, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0 } } : {}),
                },
              }
              registry.installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own edge probe', source: 'qa', warnings: [], descriptor }], assets: [{ id: assetId, size: 64, file: `${hash}.bin` }], skipped: [] })
              registry.installBrushPixels(assetId, pixels)
              const canvas = document.createElement('canvas')
              canvas.width = width; canvas.height = height
              canvas.style.cssText = `position:fixed;left:10000px;width:${width}px;height:${height}px`
              document.body.append(canvas)
              const engine = new PencilEngine(canvas, { pageWidth: width, pageHeight: height, userId: 'edges-probe' })
              try {
                await engine.paperReady()
                engine.setBaseLayers(['ink']); engine.setActiveLayer('ink'); engine.setCompositeOrder([{ id: 'ink', opacity: 1 }])
                const read = async () => {
                  const blob = await engine.exportPNG(true)
                  if (!blob) throw new Error('PNG export missing')
                  // Decode without spreading PNG bytes into a huge JS/JSON array.
                  const url = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error)
                    reader.readAsDataURL(blob)
                  })
                  const image = new Image()
                  image.src = url; await image.decode()
                  if (image.width !== width || image.height !== height) throw new Error(`Unexpected export size ${image.width}x${image.height}; expected ${width}x${height}`)
                  const decoded = document.createElement('canvas')
                  decoded.width = image.width; decoded.height = image.height
                  const drawing = decoded.getContext('2d')!
                  drawing.drawImage(image, 0, 0)
                  return drawing.getImageData(0, 0, image.width, image.height).data
                }
                const blank = await read()
                const dabs = [0, 1].map(index => ({ x: centerX + index, y: centerY, size: 80, pressure, tiltX: 0, tiltY: 0, aspectRatio: 1, angle, opacity: 1, t: index * 8 }))
                engine.appendOperation({ id: `op-${serial}`, type: 'stroke', userId: 'edges-probe', timestamp: serial, seq: 1, strokeId: `gesture-${serial}`, strokeEnd: true, tool: 'digitalBrush', preset: `brush:${id}@1`, layerId: 'ink', color: [0, 0, 0], dabs }, 'remote')
                const painted = await read()
                const gl = canvas.getContext('webgl')!
                glErrors.push(gl.getError())
                const patch = new Int16Array(radius * 2 * radius * 2 * 3)
                const rawPatch = new Int16Array(patch.length)
                let at = 0, changed = 0, magnitude = 0, minimumBlank = 255
                const bounds = [radius * 2, radius * 2, -1, -1]
                for (let y = centerY - radius; y < centerY + radius; y++) {
                  for (let x = centerX - radius; x < centerX + radius; x++) {
                    const source = (y * width + x) * 4
                    let delta = 0
                    for (let channel = 0; channel < 3; channel++) {
                      minimumBlank = Math.min(minimumBlank, blank[source + channel])
                      const raw = blank[source + channel] - painted[source + channel]
                      // Transparent export exposes coverage directly; paper composition
                      // is deliberately excluded from this geometry oracle.
                      const value = painted[source + 3] - blank[source + 3]
                      rawPatch[at] = raw; patch[at++] = value; magnitude += Math.abs(value); delta = Math.max(delta, Math.abs(value))
                    }
                    if (delta > 2) {
                      changed++
                      bounds[0] = Math.min(bounds[0], x - centerX + radius); bounds[1] = Math.min(bounds[1], y - centerY + radius)
                      bounds[2] = Math.max(bounds[2], x - centerX + radius); bounds[3] = Math.max(bounds[3], y - centerY + radius)
                    }
                  }
                }
                return { patch, rawPatch, changed, magnitude, bounds, minimumBlank }
              } finally { engine.destroy(); canvas.remove() }
            }
            const difference = (left: Int16Array, right: Int16Array) => {
              let max = 0, changed = 0
              for (let index = 0; index < left.length; index++) {
                const delta = Math.abs(left[index] - right[index]); max = Math.max(max, delta)
                if (delta) changed++
              }
              return { max, changed }
            }
            const baseline = await render(0), epsilon = await render(1e-7), half = await render(.5), high = await render(1)
            const pressureZero = await render(0, 0), bleedPressureZero = await render(1, 0)
            let haloPixels = 0, softenedPixels = 0
            for (let index = 0; index < baseline.patch.length; index += 3) {
              const before = Math.max(...baseline.patch.subarray(index, index + 3).map(Math.abs))
              const after = Math.max(...high.patch.subarray(index, index + 3).map(Math.abs))
              if (before <= 2 && after > 3) haloPixels++
              if (before > 20 && after > 3 && after < before - 3) softenedPixels++
            }
            // The bitmap is a solid square. Rotating45 exercises its corners across
            // the512px tile boundary. Subtract each local blank before alignment.
            const baselineBeforeSeam = await render(0, 1, 256, Math.PI / 4)
            const baselineAcrossSeam = await render(0, 1, 512, Math.PI / 4)
            const beforeSeam = await render(1, 1, 256, Math.PI / 4)
            const acrossSeam = await render(1, 1, 512, Math.PI / 4)
            const stripes = (left: Int16Array, right: Int16Array) => [-64, -16, -2, -1, 0, 1, 2, 16, 64].map(x => {
              let max = 0, sum = 0
              for (let y = 0; y < radius * 2; y++) {
                const index = (y * radius * 2 + radius + x) * 3
                const delta = Math.abs(left[index] - right[index]); max = Math.max(max, delta); sum += delta
              }
              return { x, max, sum }
            })
            return {
              model, tipKind, glErrors,
              painted: baseline.changed, highPainted: high.changed, haloPixels, softenedPixels,
              epsilon: difference(baseline.patch, epsilon.patch),
              half: difference(baseline.patch, half.patch), high: difference(baseline.patch, high.patch),
              zeroPressure: difference(pressureZero.patch, bleedPressureZero.patch),
              seam: difference(beforeSeam.patch, acrossSeam.patch),
              seamDiagnostic: {
                baseline: difference(baselineBeforeSeam.patch, baselineAcrossSeam.patch),
                baselineRaw: difference(baselineBeforeSeam.rawPatch, baselineAcrossSeam.rawPatch),
                highRaw: difference(beforeSeam.rawPatch, acrossSeam.rawPatch),
                baselineBounds: [baselineBeforeSeam.bounds, baselineAcrossSeam.bounds],
                highBounds: [beforeSeam.bounds, acrossSeam.bounds],
                baselineMagnitudes: [baselineBeforeSeam.magnitude, baselineAcrossSeam.magnitude],
                highMagnitudes: [beforeSeam.magnitude, acrossSeam.magnitude],
                minBlank: Math.min(beforeSeam.minimumBlank, acrossSeam.minimumBlank),
                baselineStripes: stripes(baselineBeforeSeam.patch, baselineAcrossSeam.patch),
                highStripes: stripes(beforeSeam.patch, acrossSeam.patch),
              },
              magnitudes: [baseline.magnitude, half.magnitude, high.magnitude],
            }
          }, { model, tipKind })
          console.log('Edge probe', result)
          await writeFile(`${output}/${model}-${tipKind}.json`, JSON.stringify(result, null, 2))
          reports.push(result)
          checks.push(() => {
          expect(result.glErrors).toEqual(Array(result.glErrors.length).fill(0))
          expect(result.painted).toBeGreaterThan(100)
          expect(result.epsilon.max).toBeLessThanOrEqual(1)
          expect(result.half.changed).toBeGreaterThan(20)
          expect(result.high.changed).toBeGreaterThan(20)
          expect(result.haloPixels).toBeGreaterThan(10)
          expect(result.softenedPixels).toBeGreaterThan(10)
          expect(result.zeroPressure.max).toBe(0)
          expect(result.seam.max).toBeLessThanOrEqual(1)
          expect(pageErrors).toEqual([])
          })
        }
      }
      await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2))
      for (const check of checks) check()
    } finally { await context.close() }
  } finally { await browser.close() }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })

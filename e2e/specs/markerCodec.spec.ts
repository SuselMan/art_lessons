import { expect, test } from '@playwright/test'
import { androidPage } from '../support/androidPage'
import type { PencilEngine, PencilEngineOptions } from '../../apps/web/src/engine'

interface MarkerCase { name: string; size: number; angle: number; step: number; nib: 'chisel' | 'bullet' }
declare global { interface Window {
  __markerCase?: MarkerCase
  __markerQA?: { engine: PencilEngine; canvas: HTMLCanvasElement; nextServerSeq: number }
} }

async function setupMarker() {
  const path = '/src/engine/index.ts'
  const { PencilEngine: Engine } = await import(/* @vite-ignore */ path) as { PencilEngine: new (canvas: HTMLCanvasElement, options: PencilEngineOptions) => PencilEngine }
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 256
  canvas.style.width = '1024px'; canvas.style.height = '256px'
  document.body.append(canvas)
  const engine = new Engine(canvas, { userId: 'A', pageWidth: 1024, pageHeight: 256 })
  window.__markerQA = { engine, canvas, nextServerSeq: 1 }
  await engine.paperReady()
  engine.setBaseLayers(['L']); engine.setActiveLayer('L')
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  const gl = canvas.getContext('webgl')!, ext = gl.getExtension('WEBGL_debug_renderer_info')
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : 'unknown'
}

async function runMarkerCase() {
  const { engine } = window.__markerQA!, spec = window.__markerCase!
  const snapshotPath = '/src/engine/snapshots.ts'
  const { decodeLayerTiles } = await import(/* @vite-ignore */ snapshotPath) as typeof import('../../apps/web/src/engine/snapshots')
  engine.clear()
  engine.setTool('marker'); engine.setPencil(`${spec.nib}:${spec.size}`)
  engine.setSize(spec.size); engine.setColor([0.12, 0.2, 0.35])
  engine.setNibAngle(spec.angle, 'canvas')
  const pointer = engine as unknown as {
    _onStart(sample: object): void; _onMove(sample: object): void; _onEnd(sample: object): void
  }
  const sample = (x: number) => ({ x, y: 128, pressure: 1, tiltX: 0, tiltY: 0, speed: 1, pointerType: 'pen', timeStamp: performance.now() })
  pointer._onStart(sample(100))
  for (let x = 100 + spec.step; x <= 400; x += spec.step) pointer._onMove(sample(x))
  pointer._onEnd(sample(400))
  const confirm = () => { for (const op of engine.getOperations()) if (engine.confirmOperation(op.id, window.__markerQA!.nextServerSeq)) window.__markerQA!.nextServerSeq++ }
  confirm()
  const strokes = engine.getOperations().filter(op => op.type === 'stroke')
  const readDisplay = async () => {
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const canvas = window.__markerQA!.canvas, gl = canvas.getContext('webgl')!
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels
  }
  const displayBefore = await readDisplay()
  const live = engine.bakeNetworkSnapshot('L')
  if (!live || !strokes.length) throw new Error('Native marker did not paint a completed stroke')
  engine.undo(); engine.redo(); confirm()
  const replay = engine.bakeNetworkSnapshot('L')
  if (!replay) throw new Error('Marker replay cannot be baked')
  const displayAfter = await readDisplay()
  let displayChanged = 0, displayMaxDelta = 0
  for (let i = 0; i < displayBefore.length; i++) {
    if (displayBefore[i] !== displayAfter[i]) displayChanged++
    displayMaxDelta = Math.max(displayMaxDelta, Math.abs(displayBefore[i] - displayAfter[i]))
  }
  const cold = engine.bakeLayerByFullReplay('L')
  if (!cold) throw new Error('Marker cold replay cannot be baked')
  const before = decodeLayerTiles(live, 0).tiles, after = decodeLayerTiles(replay, 0).tiles, fromCold = decodeLayerTiles(cold, 0).tiles
  let changed = 0, coldChanged = 0, maxDelta = 0, coldMaxDelta = 0, painted = 0
  if (before.length !== after.length || before.length !== fromCold.length) throw new Error('Tile count changed during marker replay')
  for (let t = 0; t < before.length; t++) {
    const a = before[t], b = after[t]
    if (a.originX !== b.originX || a.originY !== b.originY || a.width !== b.width || a.height !== b.height) throw new Error('Marker tile geometry changed')
    for (let i = 0; i < a.pixels.length; i++) {
      if (a.pixels[i] !== b.pixels[i]) changed++
      if (a.pixels[i] !== fromCold[t].pixels[i]) coldChanged++
      maxDelta = Math.max(maxDelta, Math.abs(a.pixels[i] - b.pixels[i]))
      coldMaxDelta = Math.max(coldMaxDelta, Math.abs(a.pixels[i] - fromCold[t].pixels[i]))
      if (i % 4 === 3 && a.pixels[i] > 0) painted++
    }
  }
  return { name: spec.name, painted, changed, coldChanged, maxDelta, coldMaxDelta, displayChanged, displayMaxDelta, tiles: before.length, strokes: strokes.length }
}

function retireMarker() {
  const owned = window.__markerQA
  if (owned) { owned.canvas.remove(); owned.engine.destroy(); delete window.__markerQA }
  delete window.__markerCase
}

const cases: MarkerCase[] = [
  { name: 'chisel15-90', nib: 'chisel', size: 15, angle: Math.PI / 2, step: 3 },
  { name: 'chisel20-90', nib: 'chisel', size: 20, angle: Math.PI / 2, step: 3 },
  { name: 'chisel30-90', nib: 'chisel', size: 30, angle: Math.PI / 2, step: 3 },
  { name: 'chisel15-90-coarse', nib: 'chisel', size: 15, angle: Math.PI / 2, step: 40 },
  { name: 'chisel15-0', nib: 'chisel', size: 15, angle: 0, step: 3 },
  { name: 'chisel15-45', nib: 'chisel', size: 15, angle: Math.PI / 4, step: 3 },
  { name: 'bullet8', nib: 'bullet', size: 8, angle: 0, step: 3 },
]
for (const device of ['chromium', 'samsung'] as const) {
  test(`marker codec precision matrix on ${device}`, async ({ page }) => {
    test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires the paired Samsung')
    test.setTimeout(240_000)
    await page.goto('/')
    let android: Awaited<ReturnType<typeof androidPage>> | undefined
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let evaluate = async <T>(fn: () => T): Promise<Awaited<T>> => await page.evaluate(fn)
    try {
      if (device === 'samsung') {
        android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/?qa=marker-codec-560`)
        evaluate = async <T>(fn: () => T): Promise<Awaited<T>> => await android!.evaluate(fn)
      }
      const gpu = await evaluate(setupMarker)
      console.log('Marker GPU:', JSON.stringify({ device, gpu }))
      if (device === 'samsung') expect(gpu).toMatch(/Adreno/)
      for (const spec of cases) {
        if (spec !== cases[0]) await evaluate(setupMarker)
        if (android) await android.call('Runtime.evaluate', { expression: `window.__markerCase=${JSON.stringify(spec)}` })
        else await page.evaluate(value => { window.__markerCase = value }, spec)
        const result = await evaluate(runMarkerCase)
        console.log('Marker codec:', JSON.stringify({ device, ...result }))
        expect.soft(result.painted, spec.name).toBeGreaterThan(100)
        if (spec.nib === 'chisel' && spec.angle === Math.PI / 2) {
          expect.soft(result.changed, spec.name).toBe(0)
          expect.soft(result.coldChanged, spec.name).toBe(0)
          expect.soft(result.displayChanged, spec.name).toBe(0)
        } else {
          // Control cases already differ by one byte level on the baseline
          // (also on fresh engines). Keep that bound separate from #560's
          // perpendicular discontinuity, whose strict assertions stay above.
          expect.soft(result.maxDelta, spec.name).toBeLessThanOrEqual(1)
          expect.soft(result.coldMaxDelta, spec.name).toBeLessThanOrEqual(1)
          expect.soft(result.displayMaxDelta, spec.name).toBeLessThanOrEqual(1)
        }
        await evaluate(retireMarker)
      }
      expect(errors).toEqual([])
    } finally { try { await evaluate(retireMarker) } finally { await android?.close() } }
  })
}

import { expect, test } from '@playwright/test'
import { androidPage } from '../support/androidPage'
import type { PencilEngine, PencilEngineOptions } from '../../apps/web/src/engine'
import type { StrokeOperation } from '../../packages/shared/src/index'

declare global { interface Window { __peerPreviewCase?: { tool: 'marker' | 'smudge'; grouped: boolean; mode?: 'finish' | 'drop' | 'live' } } }
async function statefulPreviewCase() {
  const spec = window.__peerPreviewCase!, mode = spec.mode ?? 'finish'
  const path = '/src/engine/index.ts', snapshotPath = '/src/engine/snapshots.ts'
  const { PencilEngine: Engine } = await import(/* @vite-ignore */ path) as { PencilEngine: new (canvas: HTMLCanvasElement, options: PencilEngineOptions) => PencilEngine }
  const { decodeLayerTiles } = await import(/* @vite-ignore */ snapshotPath) as typeof import('../../apps/web/src/engine/snapshots')
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 256; canvas.style.width = '512px'; canvas.style.height = '256px'; document.body.append(canvas)
  let gl!: WebGLRenderingContext
  let engine!: PencilEngine, before!: Uint8Array, commits = 0
  let resolve!: () => void
  const completed = new Promise<void>(done => { resolve = done })
  const read = () => {
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels
  }
  engine = new Engine(canvas, { userId: 'viewer', pageWidth: 512, pageHeight: 256, onPreviewApplied: op => {
    before = read(); commits++
    engine.appendOperation(op, 'remote')
    resolve()
  } })
  gl = canvas.getContext('webgl')!
  const sample = (x: number, t = 0) => ({ x, y: 128, size: 36, pressure: 1, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t })
  try {
    await engine.paperReady(); engine.setBaseLayers(['L', 'other']); engine.setActiveLayer('L')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    const base: StrokeOperation = { id: 'base', type: 'stroke', userId: 'base-author', timestamp: 1, seq: 1, layerId: 'L', tool: 'pencil', preset: '6B', color: [0.04, 0.08, 0.12], dabs: [64, 88, 112, 136, 160, 184, 208].map(x => sample(x)) }
    engine.appendOperation(base, 'remote')
    const dabs = spec.tool === 'marker'
      ? [80, 96, 112, 128, 144, 160, 176, 192].map((x, i) => ({ ...sample(x, i * 50), size: 24 }))
      : [180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310].map((x, i) => sample(x, i * 35))
    const op: StrokeOperation = { id: 'preview', type: 'stroke', userId: 'peer', timestamp: 2, seq: 2, layerId: 'L', tool: spec.tool, preset: spec.tool === 'marker' ? 'bullet:24' : 'normal', color: [0.7, 0.18, 0.08], dabs,
      ...(spec.grouped ? { strokeId: 'gesture' } : {}) }
    if (spec.tool === 'smudge') {
      engine.appendOperation({ ...base, id: 'other-base', layerId: 'other', seq: 3 }, 'remote')
      engine.appendOperation({ ...op, id: 'other-old', layerId: 'other', strokeId: 'old-gesture', seq: 4 }, 'remote')
    }
    const baseFrame = read()
    engine.previewOperation(op)
    await new Promise<void>(done => setTimeout(done, 80))
    const publishingBlocked = engine.bakeNetworkSnapshot('L') === null
    if (spec.tool === 'smudge') (engine as unknown as { _rebuildLayer(id: string): void })._rebuildLayer('other')
    let rollbackChanged = 0, handoverAppliedImmediately = false, liveOwed = 0
    if (mode === 'drop') {
      before = read()
      const removed = engine.dropPendingPreview(op.id)
      if (!removed) throw new Error('No accepted preview to drop')
      const rolledBack = read()
      for (let i = 0; i < baseFrame.length; i++) if (baseFrame[i] !== rolledBack[i]) rollbackChanged++
      engine.appendOperation(removed, 'remote'); resolve()
    } else if (mode === 'live') {
      engine.appendPeerLiveDabs('peer', { strokeId: 'gesture', layerId: 'L', tool: spec.tool,
        preset: op.preset, color: op.color, packetSeq: 0, dabs: dabs.slice(0, 3) })
      handoverAppliedImmediately = commits === 1
      engine.appendPeerLiveDabs('peer', { strokeId: 'gesture', layerId: 'L', tool: spec.tool,
        preset: op.preset, color: op.color, packetSeq: 1, dabs: dabs.slice(3) })
      liveOwed = engine.endPeerLiveStroke('peer', 'gesture')
    }
    await completed
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
    const after = read()
    let changed = 0, maxDelta = 0
    for (let i = 0; i < before.length; i++) { if (before[i] !== after[i]) changed++; maxDelta = Math.max(maxDelta, Math.abs(before[i] - after[i])) }
    const live = engine.bakeNetworkSnapshot('L')
    // A separate engine is independent of the viewer's carried smudge state.
    const referenceCanvas = document.createElement('canvas')
    referenceCanvas.width = 512; referenceCanvas.height = 256; document.body.append(referenceCanvas)
    const reference = new Engine(referenceCanvas, { userId: 'reference', pageWidth: 512, pageHeight: 256 })
    let cold: Uint8Array | null
    try {
      await reference.paperReady(); reference.setBaseLayers(['L'])
      reference.appendOperation(base, 'remote'); reference.appendOperation(op, 'remote')
      cold = reference.bakeNetworkSnapshot('L')
    } finally { referenceCanvas.remove(); reference.destroy() }
    if (!live || !cold) throw new Error('Completed preview must have bakeable canonical pixels')
    const a = decodeLayerTiles(live, 0).tiles, b = decodeLayerTiles(cold, 0).tiles
    let coldChanged = 0, coldMaxDelta = 0
    if (a.length !== b.length) throw new Error('Preview and canonical replay have different tile counts')
    for (let t = 0; t < a.length; t++) for (let i = 0; i < a[t].pixels.length; i++) {
      if (a[t].pixels[i] !== b[t].pixels[i]) coldChanged++
      coldMaxDelta = Math.max(coldMaxDelta, Math.abs(a[t].pixels[i] - b[t].pixels[i]))
    }
    return { ...spec, commits, publishingBlocked, rollbackChanged, handoverAppliedImmediately, liveOwed, changed, maxDelta, coldChanged, coldMaxDelta, ids: engine.getOperations().filter(item => item.type === 'stroke' && item.layerId === 'L').map(item => item.id) }
  } finally { canvas.remove(); engine.destroy() }
}

for (const device of ['chromium', 'samsung'] as const) {
  test(`stateful peer preview preserves its commit on ${device}`, async ({ page }) => {
    test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires paired Samsung')
    test.setTimeout(180_000)
    await page.goto('/')
    let android: Awaited<ReturnType<typeof androidPage>> | undefined
    let evaluate = async <T>(fn: () => T): Promise<Awaited<T>> => await page.evaluate(fn)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      if (device === 'samsung') {
        android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/?qa=stateful-preview-430`)
        evaluate = async <T>(fn: () => T): Promise<Awaited<T>> => await android!.evaluate(fn)
      }
      for (const tool of ['marker', 'smudge'] as const) for (const grouped of [false, true]) for (const mode of ['finish', 'drop', 'live'] as const) {
        if (mode === 'live' && !grouped) continue
        const spec = { tool, grouped, mode }
        if (android) await android.call('Runtime.evaluate', { expression: `window.__peerPreviewCase=${JSON.stringify(spec)}` })
        else await page.evaluate(value => { window.__peerPreviewCase = value }, spec)
        const result = await evaluate(statefulPreviewCase)
        console.log('Stateful preview:', JSON.stringify({ device, ...result }))
        expect.soft(result.commits).toBe(mode === 'drop' ? 0 : 1)
        expect.soft(result.ids).toEqual(['base', 'preview'])
        expect.soft(result.publishingBlocked).toBe(true)
        if (mode === 'finish') expect.soft(result.changed).toBe(0)
        if (mode === 'drop') expect.soft(result.rollbackChanged).toBe(0)
        if (mode === 'live') {
          expect.soft(result.handoverAppliedImmediately).toBe(true)
          expect.soft(result.liveOwed).toBe(0)
        }
        expect.soft(result.coldMaxDelta).toBeLessThanOrEqual(1)
      }
      expect(errors).toEqual([])
    } finally { await android?.close() }
  })
}

import { captureFieldRoles } from './fieldCapture'
import { PencilEngine } from '../../../../apps/web/src/engine/index'
import type { Operation, StrokeOperation, Dab, PaperType } from '@grafetto/shared'
import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
import { WatercolorPasses } from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'

// This diagnostic page owns its fetch mapping, engine and canvases. No Room,
// socket, server, account or production room is involved.
const nativeFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('/paper/')) return nativeFetch(new URL('./paper/' + input.slice(7), location.href), init)
  return nativeFetch(input, init)
}) as typeof window.fetch

export { PencilEngine, WatercolorPasses, AccumulationBuffer }

type Backend = 'webgl1' | 'webgl2' | 'mrt'
type Probe = { gl: WebGLRenderingContext; _settle: unknown; _rebuildJobs: Map<string, unknown>; _pendingRebuilds: Set<string>; _unsettledLayers: Set<string>; _layers: Map<string, ILayerBuffer>; _watercolorPasses: WatercolorPasses }
let engine: PencilEngine | null = null
const show = (value: unknown) => { const node = document.querySelector('#prototype-output'); if (node) node.textContent = JSON.stringify(value, null, 2) }
const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer))].map(x => x.toString(16).padStart(2, '0')).join('')
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const clockBase = 1791400000000

function stroke(id: string, points: Array<[number, number]>, pigment: number, color: [number, number, number], wet = '0'): StrokeOperation {
  const dabs: Dab[] = points.map(([x, y], i) => ({ x, y, pressure: .8, tiltX: 0, tiltY: 0, size: 400, aspectRatio: 1, angle: 0, opacity: 1, t: i * 16 }))
  return { id, type: 'stroke', userId: 'qa-webgl2', timestamp: clockBase + Number(id.slice(-1)) * 1000, layerId: 'L', tool: 'watercolor', preset: `normal:${pigment}:100`, color, dabs, strokeId: id, washId: 'wash-' + id, wet: wet.repeat(dabs.length) }
}
function tape(scenario: string): Operation[] {
  const zigzag = Array.from({ length: 37 }, (_, i): [number, number] => {
    const leg = Math.min(2, Math.floor(i / 12)), t = (i - leg * 12) / 12
    return [leg % 2 ? 760 - 500 * t : 260 + 500 * t, 320 + leg * 110 + 80 * t]
  })
  const ops: Operation[] = [{ id: 'layer-0', type: 'layer_add', userId: 'qa-webgl2', timestamp: clockBase, layerId: 'L', name: 'Prototype' }]
  if (scenario === 'puddle') {
    ops.push(stroke('stroke-1', [[400, 450], [500, 450], [600, 450]], 0, [.2, .1, .5]))
    ops.push(stroke('stroke-2', [[470, 445], [500, 450], [530, 455]], 100, [.2, .1, .5], 'f'))
    ops.push(stroke('stroke-3', [[520, 450], [560, 460], [580, 455]], 100, [.05, .5, .2], 'f'))
  } else {
    ops.push(stroke('stroke-1', zigzag, 100, [.2, .1, .5]))
    ops.push(stroke('stroke-2', [...zigzag].reverse(), 100, [.05, .5, .2], 'f'))
  }
  ops.push({ id: 'dry-4', type: 'paper_dry', userId: 'qa-webgl2', timestamp: clockBase + 4000 })
  return ops
}
async function idle(probe: Probe) {
  const deadline = performance.now() + 90000
  let stable = 0
  while (stable < 3) {
    if (performance.now() > deadline) throw new Error('Prototype pixel work timeout')
    if (probe.gl.isContextLost()) throw new Error('Prototype context lost')
    await frame()
    stable = probe._settle || probe._rebuildJobs.size || probe._pendingRebuilds.size || probe._unsettledLayers.size ? 0 : stable + 1
  }
}
async function hashLayer(probe: Probe) {
  const hashes: Array<{ x: number; y: number; w: number; h: number; rgbaSha256: string }> = []
  for (const tile of probe._layers.get('L')!.allResident()) {
    const buffer: AccumulationBuffer = tile.buffer
    hashes.push({ x: tile.originX, y: tile.originY, w: buffer.width, h: buffer.height, rgbaSha256: await digest(buffer.readPixels()) })
  }
  return hashes.sort((a, b) => a.y - b.y || a.x - b.x)
}
export function disposePrototype() {
  engine?.destroy(); engine = null
  document.querySelector('#surface')!.replaceChildren()
}
export async function runPrototype({ backend = 'webgl1', scenario = 'zigzag', paper = 'flat' }: { backend?: Backend; scenario?: string; paper?: PaperType } = {}) {
  disposePrototype()
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024
  document.querySelector('#surface')!.append(canvas)
  const started = performance.now()
  engine = new PencilEngine(canvas, { diagnosticWebgl2: backend !== 'webgl1', paper, pageWidth: 1024, pageHeight: 1024, userId: 'qa-webgl2', joinedTouch: true, gradientFibres: true })
  const current = engine, probe = current as unknown as Probe
  ;(window as unknown as { __prototypeEngine: PencilEngine }).__prototypeEngine = current
  await current.paperReady()
  if (backend === 'mrt') {
    if (!probe._watercolorPasses.warmBrushMrt()) throw new Error('MRT unavailable')
    probe._watercolorPasses.diagnosticBrushMrt = true
  }
  current.setLocked(false); current.setActiveLayer('L'); current.setCompositeOrder([{ id: 'L', opacity: 1 }])
  const initMs = performance.now() - started
  const operations = tape(scenario)
  const tapeSha256 = await digest(new TextEncoder().encode(JSON.stringify(operations)))
  const phaseMs: number[] = [], startedPaint = performance.now()
  for (const operation of operations) {
    const before = performance.now(); current.appendOperation(operation, 'remote'); await idle(probe); phaseMs.push(performance.now() - before)
  }
  await idle(probe)
  const paintMs = performance.now() - startedPaint
  const fields = await captureFieldRoles(current as unknown as Parameters<typeof captureFieldRoles>[0], paper, probe._watercolorPasses.brushPairStats.pairs)
  const materialWholeLayer = await hashLayer(probe)
  const blob = await current.exportPNG(true)
  if (!blob) throw new Error('Export not ready')
  const image = await createImageBitmap(blob), result = document.createElement('canvas')
  result.width = image.width; result.height = image.height
  const ctx = result.getContext('2d')!; ctx.drawImage(image, 0, 0); image.close()
  const rgbaSha256 = await digest(new Uint8Array(ctx.getImageData(0, 0, result.width, result.height).data.buffer))
  const beforeUndo = await hashLayer(probe)
  const undo = current.undo(); await idle(probe)
  const undone = await hashLayer(probe)
  const redo = current.redo(); await idle(probe)
  const redone = await hashLayer(probe)
  const ext = probe.gl.getExtension('WEBGL_debug_renderer_info')
  const report = { backend, scenario, paper, tapeSha256, code: '__CODE__', initMs, paintMs, phaseMs,
    canvas: [canvas.width, canvas.height], renderer: ext ? probe.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    glError: probe.gl.getError(), lost: probe.gl.isContextLost(), operations: current.getOperations().map(op => ({ id: op.id, type: op.type })),
    fields, materialWholeLayer, rgbaSha256, exportSize: [result.width, result.height], mrt: { ...probe._watercolorPasses.brushPairStats },
    undo: { id: undo?.id, meaningful: JSON.stringify(undone) !== JSON.stringify(beforeUndo) },
    redo: { id: redo?.id, exact: JSON.stringify(redone) === JSON.stringify(beforeUndo) },
    limitations: ['No Room/socket/ACK/REST or human touch benchmark', 'Hash/readback/export follows timed paint; timings include driver/JS/RAF, not GPU timer', 'Field capture covers retained canonical scratch and named working slots, not every intermediate iteration', 'Undo/redo source timestamps vary; original tape hash is fixed'] }
  show(report)
  ;(window as unknown as { __prototypeReport: unknown }).__prototypeReport = report
  return report
}
Object.assign(window, { runPrototype, disposePrototype })
document.querySelector('#run-prototype')?.addEventListener('click', async () => {
  const button = document.querySelector('#run-prototype') as HTMLButtonElement; button.disabled = true
  try { await runPrototype({ backend: (document.querySelector('#backend') as HTMLSelectElement).value as Backend, scenario: (document.querySelector('#scenario') as HTMLSelectElement).value, paper: (document.querySelector('#paper') as HTMLSelectElement).value as PaperType }) }
  catch (error) { show({ error: String(error), stack: (error as Error).stack }) }
  finally { button.disabled = false }
})
show({ ready: true, note: 'No GPU context created until explicit run. Call runPrototype from controller or choose a case.' })

import { BRUSH_SAMPLE_VERSION, strokeDabs, galleryBrushRole, type BrushLibrary, type ToolType } from '@grafetto/shared'
import { PencilEngine } from './index'
import { installBrushLibrary, installBrushPixels, retainImportedBrushResources, prepareMyPaintKernel, prepareBristleSaturationLookup } from './brushLibrary'

export { BRUSH_SAMPLE_VERSION }
export interface BrushSampleInput { library: BrushLibrary; reference: string; assets: Record<string, string> }
/** A disposable engine using the actual pointer/dab pipeline. Called by the
 * isolated server browser, never on opening a user's brush picker. */
export async function renderBrushSample(input: BrushSampleInput): Promise<string> {
  installBrushLibrary(input.library)
  for (const [id, bytes] of Object.entries(input.assets)) installBrushPixels(id, Uint8Array.from(atob(bytes), c => c.charCodeAt(0)))
  const brush = input.library.brushes.find(b => `brush:${b.descriptor.id}@${b.descriptor.version}` === input.reference)
  const clone = !!brush?.descriptor.clone
  const role = brush ? galleryBrushRole(brush) : input.reference === 'eraser' ? 'eraser' : input.reference === 'smudge' ? 'smudge' : 'drawing'
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 128
  Object.assign(canvas.style, { width: '512px', height: '128px', position: 'fixed', left: '0', top: '0' })
  document.body.append(canvas)
  let strokes = 0
  const engine = new PencilEngine(canvas, { paper: 'flat', pageWidth: 512, pageHeight: 128, userId: 'brush-preview', onLocalOperation: op => { if (op.type === 'stroke') strokes++ } })
  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  try {
    await engine.paperReady()
    engine.appendOperation({ type: 'layer_add', id: 'preview-layer', userId: 'brush-preview', timestamp: 0, layerId: 'ink', name: 'Preview' })
    engine.setCompositeOrder([{ id: 'ink', opacity: 1 }]); engine.setActiveLayer('ink')
    const draw = async (points: Array<{ x: number; y: number; pressure: number }>) => {
      const before = strokes
      for (let i = 0; i < points.length; i++) {
        const p = points[i], type = i === 0 ? 'pointerdown' : i === points.length - 1 ? 'pointerup' : 'pointermove'
        const event = new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: p.x, clientY: p.y, pressure: p.pressure, tiltX: 15, tiltY: 25 })
        Object.defineProperty(event, 'getCoalescedEvents', { value: () => [event] })
        canvas.dispatchEvent(event)
        await wait(8)
      }
      const end = performance.now() + 20_000
      while (strokes === before && performance.now() < end) await wait(16)
      if (strokes === before) throw Error('Sample stroke did not commit')
      const recorded = engine.getOperations().filter(op => op.type === 'stroke').slice(-1)[0]
      if (points.length > 20 && (!recorded || recorded.type !== 'stroke' || strokeDabs(recorded).length < 8)) throw Error('Sample stroke contains no continuous movement')
    }
    if (role !== 'drawing' || clone) {
      const underlayY = clone ? 106 : 64
      engine.setTool('marker'); engine.setPencil('round'); engine.setSize(clone ? 44 : 74); engine.setOpacity(1)
      engine.setColor([0.18, 0.42, 0.72])
      await draw([{ x: 40, y: underlayY, pressure: 1 }, { x: 256, y: underlayY, pressure: 1 }, { x: 256, y: underlayY, pressure: 1 }])
      if (role === 'smudge' || clone) {
        engine.setColor([0.86, 0.35, 0.2])
        await draw([{ x: 260, y: underlayY, pressure: 1 }, { x: 450, y: underlayY, pressure: 1 }, { x: 450, y: underlayY, pressure: 1 }])
      } else await draw([{ x: 250, y: underlayY, pressure: 1 }, { x: 470, y: underlayY, pressure: 1 }, { x: 470, y: underlayY, pressure: 1 }])
    }
    if (brush?.descriptor.mypaint) await prepareMyPaintKernel()
    if (brush?.descriptor.bristle?.ink?.useSaturation) { const work = prepareBristleSaturationLookup(brush.descriptor.bristle); if (work) await work }
    const tool: ToolType = brush ? role === 'drawing' ? 'digitalBrush' : role : input.reference as ToolType
    engine.setTool(tool); engine.setPencil(brush ? input.reference : tool === 'eraser' || tool === 'smudge' ? 'native' : 'HB')
    engine.setSize(brush ? Math.max(8, Math.min(54, brush.sourceDefaults?.sizePx ?? 28)) : 26)
    engine.setOpacity(1); engine.setColor([0.12, 0.14, 0.18])
    if (brush) await engine.prepareBrush(input.reference)
    await wait(50)
    if (clone) {
      engine.requestCloneSourcePick()
      for (const type of ['pointerdown', 'pointerup']) {
        const event = new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: 40, clientY: 106, pressure: .8 })
        Object.defineProperty(event, 'getCoalescedEvents', { value: () => [event] })
        canvas.dispatchEvent(event)
      }
    }
    await draw(Array.from({ length: 81 }, (_, i) => { const u = i / 80; return { x: 35 + u * 440, y: 64 + Math.sin(u * Math.PI * 2) * 19, pressure: .15 + Math.sin(u * Math.PI) * .8 } }))
    const blob = await engine.exportPNG(false)
    if (!blob) throw Error('Sample export failed')
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
  } finally { engine.destroy(); canvas.remove(); retainImportedBrushResources([]) }
}

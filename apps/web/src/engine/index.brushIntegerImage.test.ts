import { expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels } from './brushLibrary'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady, brushDraws } from './testing/engineTestUtils'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushPreparationResources, brushTextureResourceKey } from './src/dabs/BrushPreparation'
import { nativeImageResource } from './src/dabs/NativeImageBank'
import { BRUSH_STAMP_FRAG, createBrushStampFragment } from './src/raster/brushBehaviorShaders'

let serial = 49000
function fixture(dual?: 'inline' | 'independent', animation = false) {
  const ids = [0, 1].map(() => `asset:${(++serial).toString(16).padStart(64, '0')}` as const)
  const child: BrushDescriptor = {
    ...digitalBrushFromPreset('hard-round'), id: `imported-${(++serial).toString(16).padStart(24, '0')}`, version: 130,
    tip: { kind: 'bitmap', mask: ids[0], hardness: 1, aspect: 1, angle: .2, rotation: 'fixed',
      imageSampling: { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 2, y: 1, width: 3, height: 5 } },
      ...(animation ? { animation: { mode: 'incremental' as const, frames: ids } } : {}),
    },
    sizeByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]], behavior: { version: 2 },
  }
  const descriptor: BrushDescriptor = dual ? {
    ...digitalBrushFromPreset('hard-round'), id: `imported-${(++serial).toString(16).padStart(24, '0')}`, version: 130,
    sizeByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
    behavior: { version: 2, dual: { brush: child, blendMode: 'multiply', ...(dual === 'independent' ? { sampling: 'independent' as const } : {}) } },
  } : child
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Authored integer image', source: 'qa', warnings: [], descriptor }],
    assets: ids.map(id => ({ id, size: 8, file: `${id.slice(6)}.bin` })), skipped: [] })
  ids.forEach((id, frame) => {
    const pixels = new Uint8Array(64)
    for (let y = 1; y < 6; y++) for (let x = 2; x < 5; x++) pixels[y * 8 + x] = frame ? 127 : 255
    installBrushPixels(id, pixels)
  })
  return { descriptor, child, preset: `brush:${descriptor.id}@130` }
}
it('keeps legacy shader source unchanged and isolates native domain/pixel geometry in one new variant', () => {
  expect(createBrushStampFragment()).toBe(BRUSH_STAMP_FRAG)
  expect(createBrushStampFragment(true)).not.toContain('integerImageSample')
  const source = createBrushStampFragment(true, true)
  expect(source).toContain('gl_FragCoord.x>=domain.z')
  expect(source).toContain('if(u_tipImageEnabled<0.5 && max(abs(p.x),abs(p.y))>=1.0)')
  expect(source).toContain('if (u_dualImageEnabled<0.5 && u_dualKind<2.5')
  expect(source).toContain('pixel/u_dualProceduralGeometry.xy')
})
it.each([undefined, 'inline', 'independent'] as const)('prepares all sizes and frames without hot uploads: %s child route', async dual => {
  const { descriptor, preset } = fixture(dual, true)
  const resources = brushPreparationResources(descriptor)
  const imageResources = resources.filter(resource => resource.nativeImage)
  expect(imageResources).toHaveLength(12)
  expect(new Set(imageResources.map(brushTextureResourceKey)).size).toBe(12)
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  try {
    await paperReady(engine)
    await new Promise(resolve => setTimeout(resolve, 5))
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const gl = engine['gl'], upload = vi.spyOn(gl, 'texImage2D'), compile = vi.spyOn(gl, 'createProgram')
    await expect(engine.prepareBrush(preset)).resolves.toEqual({ status: 'ready' })
    const typed = () => upload.mock.calls.filter(call => ArrayBuffer.isView(Array.from(call)[8])).length
    const prepared = typed()
    expect(compile).toHaveBeenCalledTimes(1)
    expect(engine['_brush']['textures'].bytes).toBeLessThanOrEqual(16 * 1024 * 1024)
    expect(engine['_brush']['materialMips']).toBe(engine['_brushMipCache'])
    expect(engine['_brushMipCache'].bytes).toBeLessThanOrEqual(4 * 1024 * 1024)
    engine.appendOperation(makeStroke('peer', 'ink', [1, 5, 15, 2].map((size, index) => dab(16 + index * 8, 32, { size, pressure: 1, opacity: 1 })), {
      tool: 'digitalBrush', preset, strokeId: 'prepared-all-levels', strokeEnd: true,
    }), 'remote')
    expect(typed()).toBe(prepared)
    expect(compile).toHaveBeenCalledTimes(1)
  } finally { engine.destroy() }
})
it('uploads selected NPOT bounds/domain in GL tile coordinates and invalidates residency on context restore', async () => {
  const { descriptor, preset } = fixture()
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  try {
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    await engine.prepareBrush(preset)
    engine.appendOperation(makeStroke('peer', 'ink', [dab(32.25, 32.25, { size: 5, pressure: 1, opacity: 1, angle: 0 })], {
      tool: 'digitalBrush', preset, strokeId: 'geometry', strokeEnd: true,
    }), 'remote')
    const draw = brushDraws(engine).find(draw => draw.kind === 'stamp' && draw.uniforms.get('u_tipImageEnabled') === 1)!
    expect(draw).toBeDefined()
    const selected = nativeImageResource(descriptor.tip.mask!, descriptor.tip, 5)!
    expect(draw.uniforms.get('u_tipBounds')).toEqual([selected.bounds.x, selected.bounds.y, selected.bounds.width, selected.bounds.height])
    const domain = draw.uniforms.get('u_tipImageDomain') as number[]
    expect(domain.every(Number.isInteger)).toBe(true)
    expect(draw.uniforms.get('u_wickPx')).toBeGreaterThan(0)
    const old = engine['_brush']['behavior']['imageStamp']?.program
    engine['_brush'].initGL()
    expect(engine['_brush']['behavior']['imageStamp']).toBeUndefined()
    await expect(engine.prepareBrush(preset)).resolves.toEqual({ status: 'ready' })
    expect(engine['_brush']['behavior']['imageStamp']?.program).not.toBe(old)
  } finally { engine.destroy() }
})


it('fails native readiness explicitly before compilation/upload when the full bank exceeds device dimensions', async () => {
  const { preset } = fixture()
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  try {
    await paperReady(engine)
    const gl = engine['gl'], original = gl.getParameter.bind(gl)
    const uploads = vi.spyOn(gl, 'texImage2D'), programs = vi.spyOn(gl, 'createProgram')
    vi.spyOn(gl, 'getParameter').mockImplementation(parameter => parameter === gl.MAX_TEXTURE_SIZE ? 32 : original(parameter))
    await expect(engine.prepareBrush(preset)).rejects.toThrow('GPU texture dimension')
    expect(uploads).not.toHaveBeenCalled()
    expect(programs).not.toHaveBeenCalled()
  } finally { engine.destroy() }
})

it('does not turn incomplete native residency into a legacy skipped/usable readiness result', async () => {
  const { preset } = fixture()
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  try {
    await paperReady(engine)
    const painter = engine['_brush'], original = painter.hasPreparedTexture.bind(painter)
    let forceMissing = false
    vi.spyOn(painter, 'hasPreparedTexture').mockImplementation(resource => forceMissing ? false : original(resource))
    await expect(engine.prepareBrush(preset, { onProgress: (done, total) => { if (done === total) forceMissing = true } })).rejects.toThrow('lost residency')
  } finally { engine.destroy() }
})

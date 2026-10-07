import { it, expect, vi } from 'vitest'
import { adaptDiagnosticWebgl2, diagnosticWebgl2Raw, expandLegacyPixels, shaderTo300 } from './diagnosticWebgl2'
import * as shaders from './shaders'
import { brushMrt300 } from './brushMrt'
import { createTestEngine } from '../../testing/engineTestUtils'
import type { WatercolorPasses } from './WatercolorPasses'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'

it('adapts every literal exported production shader through the supported GLSL300 subset', () => {
  let count = 0
  for (const [name, value] of Object.entries(shaders)) {
    if (typeof value !== 'string' || !/_(VERT|FRAG)$/.test(name)) continue
    const result = shaderTo300(value, name.endsWith('_VERT'))
    expect(result.startsWith('#version 300 es\n'), name).toBe(true)
    const executable = result.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(executable, name).not.toMatch(/\b(attribute|varying|texture2D|gl_FragColor)\b/)
    expect(shaderTo300(result, name.endsWith('_VERT')), name).toBe(result)
    count++
  }
  expect(count).toBeGreaterThan(30)
})

it('expands all legacy sampler channels exactly, including padded rows and null allocation', () => {
  expect(expandLegacyPixels(1, 2, 0x1909, new Uint8Array([20, 0, 0, 0, 90]), 4)).toEqual(new Uint8Array([20, 20, 20, 255, 90, 90, 90, 255]))
  expect(expandLegacyPixels(1, 2, 0x190a, new Uint8Array([20, 12, 0, 0, 90, 70]), 4)).toEqual(new Uint8Array([20, 20, 20, 12, 90, 90, 90, 70]))
  expect(expandLegacyPixels(2, 1, 0x1906, new Uint8Array([20, 90]), 1)).toEqual(new Uint8Array([0, 0, 0, 20, 0, 0, 0, 90]))
  expect(expandLegacyPixels(1, 1, 0x190a, new Uint8Array([128, 128]), 4)).toEqual(new Uint8Array([128, 128, 128, 128]))
  expect(expandLegacyPixels(1, 2, 0x1909, new Uint8Array([20, 0, 0, 0, 0, 0, 0, 0, 90]), 8)).toEqual(new Uint8Array([20, 20, 20, 255, 0, 0, 0, 0, 90, 90, 90, 255]))
  expect(expandLegacyPixels(3, 4, 0x190a, null, 1)).toBeNull()
  expect(() => expandLegacyPixels(1, 2, 0x1909, new Uint8Array([20, 90]), 4)).toThrow('aligned rows')
})

it('binds native receiver, adapts only admitted uploads, resets alignment on restore and exposes core extensions', () => {
  const listeners: Record<string, () => void> = {}
  const image = vi.fn(), sub = vi.fn(), shader = vi.fn(), divisor = vi.fn(), instanced = vi.fn()
  const raw = {
    canvas: { addEventListener: (name: string, cb: () => void) => { listeners[name] = cb } },
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, UNPACK_ALIGNMENT: 0xcf5, SHADER_TYPE: 0x8b4f, VERTEX_SHADER: 0x8b31, MAX: 0x8008, MIN: 0x8007,
    shaderSource: shader, getShaderParameter: () => 0x8b31,
    texImage2D: image, texSubImage2D: sub, pixelStorei: vi.fn(),
    getExtension: vi.fn(() => null), vertexAttribDivisor: divisor, drawArraysInstanced: instanced, drawElementsInstanced: vi.fn(),
    getParameter() { expect(this).toBe(raw); return 17 },
  }
  const adapted = adaptDiagnosticWebgl2(raw as unknown as WebGL2RenderingContext)
  expect(diagnosticWebgl2Raw(adapted)).toBe(raw)
  expect(adapted.getParameter(0)).toBe(17)
  const gl = adapted
  gl.shaderSource({} as WebGLShader, shaders.DISPLAY_VERT)
  expect(shader.mock.calls[0][1]).toContain('#version 300 es')
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(0, 0, gl.LUMINANCE, 1, 2, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([12, 34]))
  expect(image.mock.calls[0][8]).toEqual(new Uint8Array([12, 12, 12, 255, 34, 34, 34, 255]))
  listeners.webglcontextrestored()
  expect(() => gl.texImage2D(0, 0, gl.LUMINANCE, 1, 2, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([12, 34]))).toThrow()
  gl.texSubImage2D(0, 0, 0, 0, 1, 1, gl.ALPHA, gl.UNSIGNED_BYTE, new Uint8Array([16]))
  expect(sub.mock.calls[0][8]).toEqual(new Uint8Array([0, 0, 0, 16]))
  expect(gl.getExtension('EXT_blend_minmax')).toEqual({ MAX_EXT: raw.MAX, MIN_EXT: raw.MIN })
  gl.getExtension('ANGLE_instanced_arrays')!.vertexAttribDivisorANGLE(2, 1)
  expect(divisor).toHaveBeenCalledWith(2, 1)
  const rgba = new Uint8Array(4)
  gl.texImage2D(0, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
  expect(image.mock.calls.at(-1)?.[8]).toBe(rgba)
})

it('uses the measured simultaneous pre-contact MRT expression without removing the donor bound', () => {
  const source = brushMrt300(shaders.WC_BRUSH_DRAG_FRAG)
  expect(source).toContain('layout(location=1) out highp vec4 outColor;')
  expect(source).toContain('float outgoing=integerFraction(center,neighbour,dir);')
  expect(source).toContain('resultC-=floor(ownC*outgoing);')
  expect(source).toContain('resultP-=floor(ownP*outgoing);')
  expect(source).toContain('limit=min(limit,channelLimit(C.a,roomC.a,raw));')
  expect(source).toContain('outPigment=resultP/255.0;')
  expect(() => brushMrt300('void main(){}')).toThrow('signature')
})

it('never enables or compiles MRT on an ordinary WebGL1 engine', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as { _watercolorPasses: WatercolorPasses; _ribbonScratchPool: RibbonScratchPool }
  const passes = probe._watercolorPasses, pool = probe._ribbonScratchPool
  const buffers = Array.from({ length: 5 }, () => pool.acquire(64, 64))
  try {
    expect(passes.diagnosticBrushMrt).toBe(false)
    passes.diagnosticBrushMrt = true
    expect(passes.warmBrushMrt()).toBe(false)
    expect(passes.brushPair({ w: 64, h: 64, coverage: buffers[4] }, {} as WebGLTexture, 4, 1, buffers[0], buffers[1], buffers[2], buffers[3], [0, 0, 1, 1], [0, 0, 64, 64], 1)).toBe(false)
    expect(passes.brushPairStats).toEqual({ pairs: 0, fallbacks: 1, pixels: 0 })
  } finally { for (const buffer of buffers) pool.release(buffer); engine.destroy() }
})

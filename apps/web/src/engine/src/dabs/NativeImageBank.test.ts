import { expect, it, vi } from 'vitest'
import type { BrushTip } from '@grafetto/shared'
import { MockGL } from '../../testing/mockGL'
import { nativeImageBank, nativeImageResource, nativeImagePixels, nativeImageDomain, nativeImageDomainUniform } from './NativeImageBank'
import { assertNativeImageAdmission, brushPreparationBytes, brushPreparationPlan, brushTextureResourceKey } from './BrushPreparation'
import { digitalBrushFromPreset } from '../presets/digitalBrushPresets'
import { uploadBrushTexture } from './BrushTextureCache'

const id = `asset:${'9'.repeat(64)}` as const
function tip(): BrushTip {
  return { kind: 'bitmap', mask: id, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed',
    imageSampling: { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 2, y: 1, width: 3, height: 5 } } }
}
it('plans every reachable frame level with its actual NPOT allocation and distinct immutable role key', () => {
  const value = tip(), bank = nativeImageBank(id, value)
  expect(bank.map(level => level.scale)).toEqual([8, 4, 2, 1, .5, .25])
  expect(nativeImageBank(id, value)).toBe(bank)
  expect(new Set(bank.map(level => level.key)).size).toBe(bank.length)
  const descriptor = { ...digitalBrushFromPreset('hard-round'), tip: value }
  const plan = brushPreparationPlan(descriptor)
  const resources = plan.resources.filter(resource => resource.nativeImage)
  expect(plan.capabilities).toContain('stampImage')
  expect(resources.map(brushTextureResourceKey)).toEqual(bank.map(level => level.key))
  expect(brushPreparationBytes(resources, () => { throw Error('Native metadata must not read source pixels') }))
    .toBe(bank.reduce((sum, level) => sum + level.width * level.height * 4, 0))
  const second = tip(); second.imageSampling!.sourceRect.x++
  expect(nativeImageBank(id, second)[0].key).not.toBe(bank[0].key)
})
it('selects source-scale levels and preserves odd-axis geometry with independent normalized spans', () => {
  const value = tip()
  const level = nativeImageResource(id, value, 2.5)!
  expect(level.scale).toBe(.5)
  expect([level.width, level.height]).toEqual([4, 5])
  expect(level.bounds.width).toBeCloseTo((5 / 3 * 2) / 4)
  expect(level.bounds.height).toBeCloseTo(3 / 5)
  expect(nativeImageResource(id, value, 5 * (.5 + .5e-6))).toBe(level)
  expect(nativeImageResource(id, value, 5 * (.5 + 2e-6))?.scale).toBe(1)
})
it('crops the explicit rectangle before recovering/filtering brightness, excluding padded garbage', () => {
  const value = tip(), original = new Uint8Array(8 * 8).fill(99)
  for (let y = 0; y < 5; y++) original.fill(255, (y + 1) * 8 + 2, (y + 1) * 8 + 5)
  const level = nativeImageResource(id, value, 5)!
  const actual = nativeImagePixels(level, original)
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
    expect(actual[y * level.width + x]).toBe(x > 0 && x < level.width - 1 && y > 0 && y < level.height - 1 ? 255 : 0)
  }
  expect(original[0]).toBe(99)
  expect(() => nativeImagePixels(level, new Uint8Array(4))).toThrow('rectangle exceeds')
})
it('uses a world-aligned outward domain and converts negative world Y into the destination GL frame', () => {
  const value = tip()
  const domain = nativeImageDomain(value, -2.25, -3.25, 5, 5, Math.PI / 2)
  expect(domain).toEqual({ minX: -8, minY: -7, maxX: 3, maxY: 0 })
  expect(nativeImageDomainUniform(domain, -16, -16, 32)).toEqual([8, 16, 19, 23])
  // A solid source has a nonzero bilinear fringe beyond its nominal local
  // image edge. The aligned domain admits it; abs(localUV)>=1 would clip it.
  expect(domain.minX).toBeLessThan(-2.25 - 5)
})
it('uploads exactly one NPOT plane with LINEAR+CLAMP, preserving existing GL state', () => {
  const gl = new MockGL(), api = gl as unknown as WebGLRenderingContext
  const upload = vi.spyOn(gl, 'texImage2D'), parameter = vi.spyOn(gl, 'texParameteri')
  const old = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + 3); gl.bindTexture(gl.TEXTURE_2D, old)
  const active = gl.getParameter(gl.ACTIVE_TEXTURE), unpack = gl.getParameter(gl.UNPACK_ALIGNMENT)
  const entry = uploadBrushTexture(api, [new Uint8Array(5 * 7)], gl.LUMINANCE, gl.CLAMP_TO_EDGE, false, { width: 5, height: 7 })
  expect(entry.bytes).toBe(5 * 7 * 4)
  expect(upload).toHaveBeenCalledExactlyOnceWith(gl.TEXTURE_2D, 0, gl.LUMINANCE, 5, 7, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, expect.any(Uint8Array))
  expect(parameter).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  expect(parameter).not.toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(active)
  expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(old)
  expect(gl.getParameter(gl.UNPACK_ALIGNMENT)).toBe(unpack)
})


it('rejects over-budget complete banks and unsupported GPU dimensions before derivative allocation', () => {
  const value = tip()
  const resources = nativeImageBank(id, value).map(nativeImage => ({ painter: 'stamp' as const, id, grain: false, nativeImage }))
  expect(() => assertNativeImageAdmission(resources, 32)).toThrow('GPU texture dimension')
  const large = tip(); large.imageSampling!.sourceRect = { x: 0, y: 0, width: 2048, height: 2048 }
  const huge = nativeImageBank(id, large).map(nativeImage => ({ painter: 'stamp' as const, id, grain: false, nativeImage }))
  expect(() => assertNativeImageAdmission(huge, 16384)).toThrow('texture budget')
  expect(() => assertNativeImageAdmission([{ painter: 'stamp', id, grain: false }], NaN)).not.toThrow()
})

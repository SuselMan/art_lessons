import { expect, it, vi } from 'vitest'
import type { BrushTip } from '@grafetto/shared'
import { MockGL } from '../../testing/mockGL'
import { nativeImageBank, nativeImageResource, nativeImagePixels, nativeImageDomain, nativeImageDomainUniform, nativeImageUVShift } from './NativeImageBank'
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

it('applies clamped hotspot in world axes without enlarging the physical source', () => {
  const value = tip(), resource = nativeImageResource(id, value, 1)!
  const shift = nativeImageUVShift(resource, .5, .5, 0)
  expect(shift[0]).toBeCloseTo(.2 * resource.bounds.width)
  expect(shift[1]).toBe(0)
  expect(nativeImageDomain(value, .25, .25, .5, .5, 0)).toEqual({minX:-1,minY:-1,maxX:1,maxY:1})
  expect(nativeImageUVShift(resource, 1, 1, 0)).toEqual([0,0])
  const angle = .37, rx=.25, ry=.25
  const w=.3, h=.5, c=Math.cos(angle), s=Math.sin(angle)
  const dx=(c*w+s*h-1)/2, dy=(s*w+c*h-1)/2
  const actual=nativeImageUVShift(resource,rx,ry,angle)
  expect(actual[0]).toBeCloseTo(-(c*dx+s*dy)/rx*.5*resource.bounds.width)
  expect(actual[1]).toBeCloseTo(-(-s*dx+c*dy)/ry*.5*resource.bounds.height)
  const domain=nativeImageDomain(value,-2.75,-4.75,rx,ry,angle)
  expect(domain.minX).toBe(-4)
  expect(domain.minY).toBe(-6)
})

it('preserves the portrait D1 quarter-pixel phase and mirrors the inverse offset with the image', () => {
  const value = tip()
  value.imageSampling!.sourceRect = {x:0,y:0,width:1,height:3}
  const resource = nativeImageResource(id,value,1)!
  const shift = nativeImageUVShift(resource,.5,.5,0)
  expect(shift[0]).toBeCloseTo(resource.bounds.width/3)
  expect(shift[1]).toBe(0)
  const flipped = nativeImageUVShift(resource,.5,.5,0,-1,1)
  expect(flipped[0]).toBeCloseTo(-shift[0])
  // Actual image left=-.25, width=1/3, not a one-pixel-wide source.
  const domain = nativeImageDomain(value,.25,.25,.5,.5,0)
  expect(domain).toEqual({minX:-1,minY:-1,maxX:1,maxY:1})
})

it('selects existing bank entries identically to the independent level selector at every boundary', async () => {
  const {selectNativeImageLevel} = await import('../raster/nativeImageLevel')
  let random = 9137
  const nextRandom = () => { random = (Math.imul(random,1664525)+1013904223) >>> 0; return random/4294967296 }
  for (const [width,height] of [[3,5],[1,511],[511,1],[17,31],[512,512],[63,127]]) {
    const value=tip()
    value.imageSampling!.sourceRect={x:0,y:0,width,height}
    const bank=nativeImageBank(id,value), longest=Math.max(width,height)
    const extents=[1e-12,1e12]
    for(const entry of bank) for(const delta of [-1.01e-6,-1e-6,-.99e-6,0,.99e-6,1e-6,1.01e-6]) {
      const extent=(entry.scale+delta)*longest
      if(extent>0)extents.push(extent)
    }
    for(let i=0;i<100;i++)extents.push(longest*Math.pow(2,nextRandom()*24-16))
    for(const extent of extents) {
      const selected=nativeImageResource(id,value,extent)!
      expect(selected.scale).toBe(selectNativeImageLevel({width,height},extent).scale)
      expect(bank.includes(selected)).toBe(true)
    }
    for(const extent of [0,-1,NaN,Infinity,-Infinity])expect(()=>nativeImageResource(id,value,extent)).toThrow('physical image extent')
  }
})

import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import native from './affineImageSpan16.neon-native.json'
import { decodeAffineImageSpan16, sampleAffineImageSpan16 } from './affineImageSpan16'

it('matches unchanged Qt NEON source with lane-semantic shims across groups and scalar tails', () => {
  expect(native.provenance.rgbaAndArgbBothChecked).toBe(true)
  for (const [index, c] of native.cases.entries()) {
    expect([...decodeAffineImageSpan16(Uint8Array.from(c.rgba), 'neon4')], `native conversion ${index}`).toEqual(c.expected)
  }
})

it('matches every native c8/a8 pair in mixed four-pixel groups', () => {
  const hash = createHash('sha256'), bytes = Buffer.alloc(32)
  for (let a = 0; a < 256; a++) for (let c = 0; c < 256; c++) {
    const pm = decodeAffineImageSpan16(Uint8Array.of(c,255-c,(c*73)&255,a, 7,211,31,255, 243,13,91,128, 99,42,17,0), 'neon4')
    for (let i = 0; i < pm.length; i++) bytes.writeUInt16LE(pm[i]!, i * 2)
    hash.update(bytes)
  }
  expect(hash.digest('hex')).toBe(native.allPairs.sha256LE16)
})

it('uses fetched row pair boundaries, including two-pixel scalar remainder', () => {
  for (const c of native.cases) {
    if (c.count % 2) continue
    const expected: number[] = []
    for (let i = 0; i < c.count; i += 2) expected.push(...c.expected.slice(i * 4, i * 4 + 4))
    const pm = sampleAffineImageSpan16(Uint8Array.from(c.rgba),c.count,1,[2,0,0,1,-.5,0],0,0,c.count/2,'summed','neon4','sampling')
    expect([...pm]).toEqual(expected)
  }
})

it('keeps mixed-alpha NEON conversion distinct from opaque groups and SSE decode', () => {
  const mixed = Uint8Array.of(255,128,7,255, 31,53,73,1, 0,0,0,0, 41,43,47,128)
  const neon = decodeAffineImageSpan16(mixed,'neon4')
  expect(neon[0]).toBe(65533)
  expect(neon[3]).toBe(65535)
  expect(neon).not.toEqual(decodeAffineImageSpan16(mixed,'narrow4'))
  const opaque = mixed.slice()
  for(let i=3;i<opaque.length;i+=4) opaque[i]=255
  expect(decodeAffineImageSpan16(opaque,'neon4')[0]).toBe(65535)
  expect(()=>decodeAffineImageSpan16(new Uint8Array(3),'neon4')).toThrow()
  expect(()=>decodeAffineImageSpan16(new Uint8Array(16388),'neon4')).toThrow()
})

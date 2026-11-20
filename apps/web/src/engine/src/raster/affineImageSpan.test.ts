import { expect, it } from 'vitest'
import fixture from './affineImageSpan.qt-fixtures.json'
import { affineSpanMask, sampleAffineImageSpan, type InverseImageAffine } from './affineImageSpan'

it('matches authored actual Qt5.15.13 covered spans exactly, including SIMD groups and scalar tails', () => {
  const input = Uint8Array.from(fixture.sourcePremul)
  const failures: unknown[] = []
  for (const example of fixture.cases) {
    for (let y = 0; y < example.height; y++) {
      const actual = sampleAffineImageSpan(input, fixture.sourceWidth, fixture.sourceHeight,
        example.inverse as unknown as InverseImageAffine, 0, y, example.width)
      const expected = example.premul.slice(y * example.width * 4, (y + 1) * example.width * 4)
      if (actual.some((value, index) => value !== expected[index])) failures.push({angle:example.angle,scale:example.scale,phase:example.phase,width:example.width,y,changed:actual.reduce((n,v,i)=>n+Number(v!==expected[i]),0),max:Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])))})
      const expectedMask = example.mask.slice(y * example.width, (y + 1) * example.width)
      expect([...affineSpanMask(Uint8Array.from(expected))]).toEqual(expectedMask)
    }
  }
  expect(failures).toEqual([])
})

it('rejects unverified dispatch and unbounded inputs instead of silently falling back', () => {
  const pixels = new Uint8Array(16)
  expect(() => sampleAffineImageSpan(pixels,2,2,[3,0,0,1,0,0],0,0,1)).toThrow('Downscale dispatch')
  expect(() => sampleAffineImageSpan(pixels,2,2,[1,0,0,1,NaN,0],0,0,1)).toThrow()
  expect(() => sampleAffineImageSpan(pixels,2,2,[1,0,0,1,0,0],0,0,2049)).toThrow()
  expect(() => affineSpanMask(Uint8Array.of(255,0,0,1))).toThrow('premultiplied')
})

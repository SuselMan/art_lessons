import { expect, it } from 'vitest'
import full from './affineImageSpan16.full-qt-fixtures.json'
import type { InverseImageAffine } from './affineImageSpan'
import { affineSpan16Mask, affineSpan16Straight, sampleAffineImageSpan16 } from './affineImageSpan16'

it('matches complete actual Qt dabs using observed opaque-probe spans, without assuming AABB coverage', () => {
  for(const example of full.cases) {
    const rgba=new Uint8Array(example.width*example.height*4)
    const mask=new Uint8Array(example.width*example.height)
    const source=Uint8Array.from(example.levelPremul) // native source alpha is exclusively0/255
    expect(example.directCopy).toBe(false)
    for(const span of example.spans) {
      expect(span.coverage).toBe(255)
      const pm=sampleAffineImageSpan16(source,example.levelWidth,example.levelHeight,
        example.inverse as unknown as InverseImageAffine,span.x,span.y,span.length)
      rgba.set(affineSpan16Straight(pm),(span.y*example.width+span.x)*4)
      mask.set(affineSpan16Mask(pm),span.y*example.width+span.x)
    }
    expect([...rgba]).toEqual(example.rgba)
    expect([...mask]).toEqual(example.mask)
  }
})

it('bounds layouts and matrix work and rejects invalid premultiplication', () => {
  expect(()=>sampleAffineImageSpan16(new Uint8Array(4),1,1,[0,0,0,0,0,0],0,0,1)).toThrow('matrix')
  expect(()=>sampleAffineImageSpan16(new Uint8Array(4),1,1,[1,0,0,1,0,0],0,0,2049)).toThrow()
  expect(()=>affineSpan16Straight(Uint16Array.of(65535,0,0,1))).toThrow('premultiplied')
})

it('explicitly rejects partial source alpha before unverified SIMD decode', () => {
  expect(()=>sampleAffineImageSpan16(Uint8Array.of(20,20,20,127),1,1,[1,0,0,1,0,0],0,0,1)).toThrow('Partial source alpha')
})

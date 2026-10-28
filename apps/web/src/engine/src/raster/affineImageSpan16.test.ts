import spans from './affineImageSpan16.qt-fixtures.json'
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

it('matches actual Qt straight-ARGB32 target with arbitrary source alpha on 90 covered-span cases', () => {
  const source=Uint8Array.from(spans.sourceRGBA)
  for(const example of spans.cases) for(let y=0;y<example.height;y++) {
    const pm=sampleAffineImageSpan16(source,spans.sourceWidth,spans.sourceHeight,
      example.inverse as unknown as InverseImageAffine,0,y,example.width)
    expect([...affineSpan16Straight(pm)]).toEqual(example.straight.slice(y*example.width*4,(y+1)*example.width*4))
    expect([...affineSpan16Mask(pm)]).toEqual(example.mask.slice(y*example.width,(y+1)*example.width))
  }
})

it('matches actual Qt with AVX2 explicitly disabled, including narrow4 scalar decode tails', async () => {
  const {default: fixture} = await import('./affineImageSpan16.sse4-qt-fixtures.json')
  expect(fixture.disabledCpuFeatures).toBe('avx2')
  expect(fixture.caseCount).toBe(spans.cases.length)
  expect(fixture.overrides).toHaveLength(1)
  const source=Uint8Array.from(spans.sourceRGBA)
  for(const [index,example] of spans.cases.entries()) for(let y=0;y<example.height;y++) {
    const expected=fixture.overrides.find(value=>value.index===index) ?? example
    const pm=sampleAffineImageSpan16(source,spans.sourceWidth,spans.sourceHeight,
      example.inverse as unknown as InverseImageAffine,0,y,example.width,'separate','narrow4')
    expect([...affineSpan16Straight(pm)]).toEqual(expected.straight.slice(y*example.width*4,(y+1)*example.width*4))
    expect([...affineSpan16Mask(pm)]).toEqual(expected.mask.slice(y*example.width,(y+1)*example.width))
  }
})

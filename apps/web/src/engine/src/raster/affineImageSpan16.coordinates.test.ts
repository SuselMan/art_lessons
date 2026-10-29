import { expect, it } from 'vitest'
import { affineImageSpan16Coordinates } from './affineImageSpan16'

it('reuses caller-owned row coordinates and preserves explicit matrix-origin convention', () => {
  const into = { fx: 0, fy: 0, dx: 0, dy: 0 }
  expect(affineImageSpan16Coordinates([1,0,0,1,0,0], 0, 0, 4, 'sampling', into)).toBe(into)
  expect(into).toEqual({fx:0,fy:0,dx:65536,dy:0})
  affineImageSpan16Coordinates([1,0,0,1,0,0], 0, 0, 4, 'unbiased', into)
  expect(into).toEqual({fx:-1,fy:-1,dx:65536,dy:0})
  const before = {...into}
  expect(() => affineImageSpan16Coordinates([1,0,0,1,0,0], 1e8, 0, 4, 'sampling', into)).toThrow(/range/)
  expect(into).toEqual(before)
})
it('rejects unproven matrix domains and malformed coordinates before writing staging', () => {
  expect(() => affineImageSpan16Coordinates([0,0,0,0,0,0],0,0,1)).toThrow(/fast-matrix/)
  expect(() => affineImageSpan16Coordinates([1,0,0,1,Infinity,0],0,0,1)).toThrow()
  expect(() => affineImageSpan16Coordinates([1,0,0,1,0,0],0,0,2049)).toThrow()
})

import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import store from './fixtures/sourceImageTransformStore.native.json'
import native from './fixtures/sourceImageTransform.native.json'
import { sourceImageScalePixels, sourceImageScaleStraightScalar } from './sourceImageScalePixels'
import { sourceImageTransformMask, sourceImageTransformPixels } from './sourceImageTransformPixels'
import { sourceImageTransformPlan } from './sourceImageTransformPlan'

const bytes = Buffer.from(store.estimatesF32LE, 'base64')
const estimates = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const profile = { products: 'separate', sourceDecode: 'wide8', straightStore: 'sse4-estimate',
  reciprocalEstimate: (alpha: number): number => estimates.getFloat32(alpha * 4, true) } as const
it('matches actual pinned createImage from selected straight levels with computed matrices and spans', () => {
  for (const [index, c] of native.cases.entries()) expect([...sourceImageTransformPixels(
    Uint8Array.from(c.expected.levelRGBA), c.width, c.height, c.shape, c.subX, c.subY, profile)], `native full image ${index}`).toEqual(c.expected.rgba)
})

it('links original opaque grayscale -> common resize -> bordered level -> exact affine output', () => {
  for (const [index, c] of native.cases.entries()) {
    if (c.preparation !== 'opaque-gray') continue
    const plan = sourceImageTransformPlan(c.width, c.height, c.shape, c.subX, c.subY)
    const straight = sourceImageScaleStraightScalar(sourceImageScalePixels(Uint8Array.from(c.input), c.width, c.height, plan.levelWidth, plan.levelHeight, 'simd'))
    const sourceWidth = plan.levelWidth + 2, sourceHeight = plan.levelHeight + 2
    const level = new Uint8Array(sourceWidth * sourceHeight * 4)
    for (let y = 0; y < plan.levelHeight; y++) level.set(straight.subarray(y * plan.levelWidth * 4, (y + 1) * plan.levelWidth * 4), ((y + 1) * sourceWidth + 1) * 4)
    expect([...level], `native level ${index}`).toEqual(c.expected.levelRGBA)
    expect([...sourceImageTransformPixels(level, c.width, c.height, c.shape, c.subX, c.subY, profile)], `native assembled ${index}`).toEqual(c.expected.rgba)
  }
})

it('retains the isolated pre-fix store witness and checks its final A8 mask separately', () => {
  const legacy = { products: 'separate', sourceDecode: 'wide8', straightStore: 'sse4-model' } as const
  const maskByte = (r: number, a: number): number => { const p = (255 - r) * a + 128; return (p + (p >>> 8)) >>> 8 }
  let rgbaChanged = 0, maskChanged = 0
  for (const c of native.cases) {
    const actual = sourceImageTransformPixels(Uint8Array.from(c.expected.levelRGBA), c.width, c.height, c.shape, c.subX, c.subY, legacy)
    for (let i = 0; i < actual.length; i++) rgbaChanged += Number(actual[i] !== c.expected.rgba[i])
    for (let i = 0; i < actual.length; i += 4) maskChanged += Number(maskByte(actual[i]!, actual[i + 3]!) !== maskByte(c.expected.rgba[i]!, c.expected.rgba[i + 3]!))
  }
  expect(rgbaChanged).toBe(2)
  expect(maskChanged).toBe(0)
})

it('rejects malformed level layouts and missing or invalid exact backend profiles', () => {
  const c = native.cases[0]!, level = Uint8Array.from(c.expected.levelRGBA)
  expect(() => sourceImageTransformPixels(level.subarray(1), c.width, c.height, c.shape, c.subX, c.subY, profile)).toThrow()
  expect(() => sourceImageTransformPixels(level, c.width, c.height, c.shape, c.subX, c.subY, { ...profile, reciprocalEstimate: undefined })).toThrow()
})

it('closes selected native material to exact A8 without another premultiplication', () => {
  for (const c of native.cases) expect([...sourceImageTransformMask(Uint8Array.from(c.expected.levelRGBA),
    c.width, c.height, c.shape, c.subX, c.subY, profile)]).toEqual(c.expected.mask)
})

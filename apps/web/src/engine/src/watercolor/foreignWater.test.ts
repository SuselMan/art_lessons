import { describe, expect, it } from 'vitest'
import { foreignWaterStencil, type WaterFootprint } from './foreignWater'

const dab = (x: number, y: number, radius: number): WaterFootprint => ({ x, y, radius, aspect: 1, angle: 0 })
const rect = { x: 0, y: 0, w: 100, h: 100 }
const sources = [{ gesture: 'puddle', footprints: [dab(50, 50, 25)] }]
const at = (image: NonNullable<ReturnType<typeof foreignWaterStencil>>, x: number, y: number) =>
  image.pixels[(image.height - 1 - Math.floor(y / 4)) * image.width + Math.floor(x / 4)]

describe('foreign wet domain', () => {
  it('does not invent water without a recorded wet contact', () => {
    expect(foreignWaterStencil(sources, [], rect)).toBeNull()
  })
  it('opens the preceding puddle wider than the contacting brush, leaving dry paper closed', () => {
    const stencil = foreignWaterStencil(sources, [dab(50, 50, 4)], rect)!
    expect(at(stencil, 50, 30)).toBe(255)
    expect(at(stencil, 50, 10)).toBe(0)
  })
  it('does not open a separate puddle the stroke never reached', () => {
    const stencil = foreignWaterStencil([...sources, { gesture: 'elsewhere', footprints: [dab(5, 5, 4)] }], [dab(50, 50, 4)], rect)!
    expect(at(stencil, 5, 5)).toBe(0)
  })
  it('keeps a flat nib oriented and places GL rows bottom-up', () => {
    const stencil = foreignWaterStencil([{ gesture: 'flat', footprints: [{ ...dab(30, 20, 5), aspect: 4, angle: Math.PI / 2 }] }], [dab(30, 20, 1)], rect)!
    expect(at(stencil, 30, 5)).toBe(255)
    expect(at(stencil, 15, 20)).toBe(0)
    expect(at(stencil, 30, 80)).toBe(0)
  })
})

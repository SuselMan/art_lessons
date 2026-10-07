import { describe, expect, it } from 'vitest'
import { brushDragField, brushDragContacts, brushDragMaxExposure, type BrushTravel } from './brushDrag'

const rect = { x: 0, y: 0, w: 64, h: 64 }
const motion: BrushTravel = { x: 32, y: 32, radius: 20, aspect: 1, angle: 0, dx: 8, dy: 0, water: 1 }
const at = (f: NonNullable<ReturnType<typeof brushDragField>>, x: number, y: number) => [...f.pixels.slice(((f.height - 1 - y) * f.width + x) * 4, ((f.height - 1 - y) * f.width + x) * 4 + 4)]
describe('recorded brush contact flow', () => {
  it('does not move paint with a dry brush or stationary jitter', () => {
    const f = brushDragField([{ ...motion, water: 0 }, { ...motion, dx: 0.001 }], rect)!
    expect(f.pixels.filter((_, i) => i % 4 === 2).some(x => x > 0)).toBe(false)
  })
  it('acts inside the actual footprint, with world Y converted to GL Y', () => {
    const f = brushDragField([{ ...motion, dx: 0, dy: 8 }], rect)!
    expect(at(f, 8, 8)[1]).toBeLessThan(128)
    expect(at(f, 8, 8)[2]).toBeGreaterThan(0)
    expect(at(f, 0, 0)[2]).toBe(0)
  })
  it('weights travel, not the number of coalesced dabs', () => {
    const a = brushDragField([motion], rect)!
    const b = brushDragField(Array.from({ length: 8 }, () => ({ ...motion, dx: 1 })), rect)!
    expect([...a.pixels]).toEqual([...b.pixels])
  })
  it('keeps direction separate from weak contact strength', () => {
    const f = brushDragField([{ ...motion, dx: 1 }], rect)!
    const [vx, vy, contact] = at(f, 8, 8)
    expect(vx).toBe(255)
    expect(vy).toBe(128)
    expect(contact).toBeGreaterThan(0)
    expect(contact).toBeLessThan(20)
  })
  it('preserves directional cancellation rather than normalising a residual', () => {
    const f = brushDragField([motion, { ...motion, dx: -8 }], rect)!
    const [vx] = at(f, 8, 8)
    expect(vx).toBeGreaterThan(80)
    expect(vx).toBeLessThan(128)
  })
  it('remembers a return direction rather than cancelling both passes', () => {
    const f = brushDragField([motion, { ...motion, dx: -30 }], rect)!
    expect(at(f, 8, 8)[0]).toBeLessThan(128)
  })
})


describe('ordered brush sweeps', () => {
  it('keeps overlapping forward and return contacts separate', () => {
    const contacts = brushDragContacts([{ ...motion, dx: 40 }, { ...motion, dx: -40 }], rect)
    expect(contacts).toHaveLength(2)
    const pixel = (c: typeof contacts[number]) => {
      const x = Math.floor((32-c.rect.x)/c.rect.w*c.field.width)
      const y = Math.floor((32-c.rect.y)/c.rect.h*c.field.height)
      return at(c.field, x, y)[0]
    }
    expect(pixel(contacts[0])).toBe(255)
    expect(pixel(contacts[1])).toBe(0)
  })
  it('ignores dry or stationary contacts and clips a sweep to the settle field', () => {
    expect(brushDragContacts([{ ...motion, water: 0 }, { ...motion, dx: 0.001 }], rect)).toEqual([])
    const contacts = brushDragContacts([{ ...motion, x: 1, y: 1, dx: 40 }], rect)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].rect.x).toBe(0)
    expect(contacts[0].rect.y).toBe(0)
    expect(contacts[0].rect.w).toBeLessThan(rect.w)
  })
})

describe('contact exposure maximum', () => {
  const original = (pixels: Uint8Array): number => {
    let exposure = 0
    for (let i = 2; i < pixels.length; i += 4) exposure = Math.max(exposure, -Math.log(Math.max(1 - pixels[i] / 255, 1 / 255)))
    return exposure
  }
  it('preserves exact floating values for every ordered pair of encoded bytes', () => {
    const pixels = new Uint8Array(8)
    for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) {
      pixels[2] = a; pixels[6] = b
      if (!Object.is(brushDragMaxExposure(pixels), original(pixels))) throw new Error(`Exposure mismatch ${a}/${b}`)
    }
    expect(Object.is(brushDragMaxExposure(new Uint8Array()), 0)).toBe(true)
  })
  it('preserves pulse counts and gains for real overlapping contact fields', () => {
    for (const radius of [1, 16, 200, 400]) {
      const contacts = brushDragContacts(Array.from({ length: 12 }, (_, i) => ({ ...motion, radius, x: 20 + i % 3 * 8, y: 20 + i * 2, dx: i % 2 ? -8 : 8 })), rect)
      for (const contact of contacts) for (const scale of [1, 2]) {
        const a = original(contact.field.pixels), b = brushDragMaxExposure(contact.field.pixels)
        expect(Object.is(a, b)).toBe(true)
        const oldSteps = Math.max(1, Math.ceil(.2 * contact.radius / scale * a * Math.SQRT2 / .84))
        const newSteps = Math.max(1, Math.ceil(.2 * contact.radius / scale * b * Math.SQRT2 / .84))
        expect(newSteps).toBe(oldSteps)
        expect(.2 * contact.radius / (newSteps * scale)).toBe(.2 * contact.radius / (oldSteps * scale))
      }
    }
  })
})

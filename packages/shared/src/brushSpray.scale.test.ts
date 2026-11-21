import { describe, expect, it } from 'vitest'
import { isBrushSpray } from './brushSpray.js'
import { spray133 } from './sprayWash133.testFixture.js'

describe('Krita Spray scale', () => {
  it('admits the native range and rejects larger values', () => {
    const spray = structuredClone(spray133().spray!)
    for (const scale of [4, 4.1, 10]) {
      spray.scale = scale
      expect(isBrushSpray(spray)).toBe(true)
    }
    spray.scale = 10.01
    expect(isBrushSpray(spray)).toBe(false)
  })
})

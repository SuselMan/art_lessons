import { describe, expect, it } from 'vitest'
import observed from './fixtures/brushRequestGeometry.observed.json'
import { brushRequestGeometry, captureBrushSourceSize, placeBrushRequest } from './brushRequestGeometry'
import { KritaRandomSource } from './nativeRandom'

describe('source request geometry before XY placement', () => {
  it('matches all 50 actual native GUI size/pressure/angle/admission receipts', () => {
    expect(observed.cases).toHaveLength(50)
    let draws = 0
    for (const c of observed.cases) {
      const geometry = brushRequestGeometry(c.sourceSize, c.scale, c.angle)
      expect(captureBrushSourceSize(c.requestedSize), c.name).toBe(c.sourceSize)
      expect(geometry.admitted, c.name).toBe(c.admitted)
      if (c.mask !== null) expect(geometry.maskWidth, c.name).toBe(c.mask)
      expect(c.draws, c.name).toHaveLength(c.admitted ? 2 : 0)
      for (const draw of c.draws) {
        const source = KritaRandomSource.restore({version:1,state:draw.before as [number,number,number],draws})
        expect(source.generateNormalized(), c.name).toBe(draw.value)
        expect(source.snapshot().state, c.name).toEqual(draw.after)
        draws++
      }
      if(c.input && c.output && c.factor!==null) {
        const first=c.draws[0]
        const placed=placeBrushRequest(geometry,c.input[0],c.input[1],c.factor,{version:1,state:first.before as [number,number,number],draws:0})
        expect(placed.snapshot.draws,c.name).toBe(2)
        expect(placed.x,c.name).toBeCloseTo(c.output[0],11)
        expect(placed.y,c.name).toBeCloseTo(c.output[1],11)
        const extent=Math.max(geometry.maskWidth,geometry.maskHeight)*c.factor
        expect(c.input[0]+(2*c.draws[0].value-1)*extent,c.name).toBeCloseTo(c.output[0],11)
        expect(c.input[1]+(2*c.draws[1].value-1)*extent,c.name).toBeCloseTo(c.output[1],11)
      }
    }
    expect(draws).toBe(92)
  })
  it('preserves rejected cursors and consumes zero-amplitude admitted requests', () => {
    const state=new KritaRandomSource(777).snapshot()
    expect(placeBrushRequest(brushRequestGeometry(24,0,0),0,0,0,state).snapshot).toBe(state)
    const placed=placeBrushRequest(brushRequestGeometry(24,1,0),0,0,0,state)
    expect(placed.x).toBe(0);expect(placed.y).toBe(0)
    expect(placed.snapshot.draws).toBe(2)
    expect(state.draws).toBe(0)
  })
  it('quantizes at capture before F32 can move an input over an integer boundary', () => {
    const below = 24 - 1e-7
    expect(Math.fround(below)).toBe(24)
    expect(captureBrushSourceSize(below)).toBe(23)
    expect(captureBrushSourceSize(24)).toBe(24)
    expect(captureBrushSourceSize(0)).toBe(1)
    expect(captureBrushSourceSize(2.3)).toBe(2)
  })
  it('uses source extent admission rather than visible ink or requested size', () => {
    expect(brushRequestGeometry(1,1,0).admitted).toBe(true)
    expect(brushRequestGeometry(24,.0001,0).admitted).toBe(false)
    expect(brushRequestGeometry(24,.001,0).admitted).toBe(true)
    expect(brushRequestGeometry(1,.01,0).admitted).toBe(true)
    expect(brushRequestGeometry(1,.01-Number.EPSILON,0).admitted).toBe(false)
  })
  it('snaps only source near-integer bounds, without inflating exact cardinal extents', () => {
    expect(brushRequestGeometry(24,1,Math.PI/2).maskWidth).toBe(24)
    expect(brushRequestGeometry(24,1,Math.PI/4).maskWidth).toBe(34)
    expect(brushRequestGeometry(24,1+1e-8,0).maskWidth).toBe(24)
    expect(brushRequestGeometry(24,1+1e-6,0).maskWidth).toBe(25)
    expect(()=>brushRequestGeometry(2.3,1,0)).toThrow(/integer sourceSize/)
  })
})

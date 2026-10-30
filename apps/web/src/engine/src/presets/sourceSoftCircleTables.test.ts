import { describe, expect, it } from 'vitest'
import original from '../../../../../../packages/shared/src/fixtures/sourceSoftAutoData/stock.native.js'
import { compileSourceSoftCircleProgram } from './sourceSoftCircleDab'
import native from './fixtures/sourceSoftCircle/tables.native.json'
import { sourceCurveTransfer, type SourceCurvePolynomial } from './sourceCurve'
function program(row: typeof native.constructors[number]): SourceCurvePolynomial {
  return { points: row.points, coefficients: row.coefficients.map(c => [c[0], c[1], c[2], c[3]] as const) }
}
describe('native soft-circle dense radial curve tables', () => {
  it('matches all3610 F64 values from original SparseLU/floatTransfer for allfive actual stock curves', () => {
    let values = 0
    for (const row of native.constructors) {
      const actual = sourceCurveTransfer(program(row), { layout: 'soft-mask', resolution: row.resolution, arithmetic: 'installed-arm64-fused-v1' })
      expect(actual).toHaveLength(row.resolution + 2)
      for (let i = 0; i < actual.length; i++) expect(Object.is(actual[i], row.values[i]), `${row.index}/${i}: ${actual[i]} != ${row.values[i]}`).toBe(true)
      values += actual.length
    }
    expect(values).toBe(3610)
  })
  it('keeps the256 sensor grid separate and includes clamped nonzero first-knot domains', () => {
    const row = native.constructors.find(r => r.index === 72)!
    expect(sourceCurveTransfer(program(row))).toHaveLength(256)
    const actual = sourceCurveTransfer(program(row), { layout: 'soft-mask', resolution: row.resolution, arithmetic: 'installed-arm64-fused-v1' })
    expect(actual.slice(0, 164)).toEqual(row.values.slice(0, 164))
    expect(actual[0]).toBe(row.points[0].y)
    expect(() => sourceCurveTransfer(program(row), { layout: 'soft-mask', resolution: 16383, arithmetic: 'installed-arm64-fused-v1' })).toThrow(RangeError)
  })
})


describe('retained original KPP source to native radial table',()=>{
  it('binds all10 raw roles to independently captured curves and geometry',()=>{
    let checked=0
    for(const row of original.rows) {
      const source=row.sourceStamp.source
      const constructor=native.constructors.find(c=>c.generator.softness_curve===source.softnessCurve.text)
      expect(constructor,row.name).toBeDefined()
      if(!constructor)throw Error('Missing original constructor')
      expect(source.softnessCurve.points).toEqual(constructor.points)
      expect(source.diameter).toBe(Number(constructor.generator.diameter))
      expect(source.ratio).toBe(Number(constructor.generator.ratio))
      expect(source.horizontalFade).toBe(Number(constructor.generator.hfade))
      expect(source.verticalFade).toBe(Number(constructor.generator.vfade))
      expect(source.antialias).toBe(false)
      expect(source.spikes).toBe(2)
      expect(source.randomness).toBe(0)
      expect(source.density).toBe(1)
      // Native coefficients are explicit test authority, not an arbitrary point
      // solver or a lookup allowed in production. Options/author stay closed.
      const actual=compileSourceSoftCircleProgram({kind:'auto',generator:'soft',shape:'circle',diameter:source.diameter,ratio:source.ratio,
        horizontalFade:source.horizontalFade,verticalFade:source.verticalFade,antialias:false,spikes:2,randomness:0,density:1,softness:1},
      {points:source.softnessCurve.points,coefficients:program(constructor).coefficients},16384)
      expect(actual.resolution).toBe(constructor.resolution)
      expect(actual.table.length).toBe(constructor.values.length)
      for(let i=0;i<actual.table.length;i++)expect(Object.is(actual.table[i],constructor.values[i]),row.name+'/'+i).toBe(true)
      checked++
    }
    expect(checked).toBe(10)
  })
})

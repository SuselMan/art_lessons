import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceCurveSensorFused.native.json'
import identity from './fixtures/sourceCurveIdentityFused.native.json'
import packets from './fixtures/sourceSensors.native.json'
import { sourceCurveTransfer, sourceCurveIsIdentity, type SourceCurvePolynomial } from './sourceCurve'
import { compileSourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
const curve=(row:typeof native.curves[number]):SourceCurvePolynomial=>({points:row.points,coefficients:row.coefficients.map(c=>[c[0],c[1],c[2],c[3]] as const)})

describe('installed ARM sensor transfer arithmetic',()=>{
  it('matches all3840 independent original values with the explicit fused sensor law',()=>{
    let checked=0,separateDifferences=0
    for(const row of native.curves) {
      const actual=sourceCurveTransfer(curve(row),{layout:'sensor',arithmetic:'installed-arm64-fused-v1'})
      const legacy=sourceCurveTransfer(curve(row))
      expect(actual.length).toBe(256)
      for(let i=0;i<256;i++) {
        expect(Object.is(actual[i],row.samples[i]),row.id+'/'+i).toBe(true)
        separateDifferences+=Number(!Object.is(legacy[i],row.samples[i]));checked++
      }
    }
    expect(checked).toBe(3840);expect(separateDifferences).toBe(948)
  })
  it('passes the explicitly chosen law through the existing option compiler',()=>{
    for(const row of native.curves) {
      const option=compileSourceOptionProgram({id:'Size',checked:true,useCurve:true,curveMode:0,strength:1,min:0,max:1,
        sensors:[{id:'pressure',curve:{...curve(row),arithmetic:'installed-arm64-fused-v1'}}]}).bind(packets.cases[0].input)
      expect(option.sensors[0].transfer).toEqual(row.samples)
    }
  })
  it('rejects unknown arithmetic instead of silently using the host law',()=>{
    const input:SourceOptionProgramInput={id:'Size',checked:true,useCurve:true,curveMode:0,strength:1,min:0,max:1,
      sensors:[{id:'pressure',curve:{points:[{x:0,y:0},{x:1,y:1}]}}]}
    Reflect.set(input.sensors[0].curve,'arithmetic','unreviewed-law')
    expect(()=>compileSourceOptionProgram(input)).toThrow('Unsupported native sensor curve arithmetic')
  })
  it('preserves the separately proven identity predicate, including corner/fuzzy boundaries',()=>{
    for(const row of identity.cases) {
      expect(sourceCurveIsIdentity(row.points),row.id).toBe(row.nativeIdentity)
      if(row.nativeIdentity) {
        const option=compileSourceOptionProgram({id:'Size',checked:true,useCurve:true,curveMode:0,strength:1,min:0,max:1,
          sensors:[{id:'pressure',curve:{points:row.points,arithmetic:'installed-arm64-fused-v1'}}]}).bind(packets.cases[0].input)
        expect(option.sensors[0].transfer,row.id).toBeUndefined()
      }
    }
    expect(identity.cases.some(r=>r.nativeIdentity && r.nativeTableIdentityDifferenceCount>0)).toBe(true)
  })
})

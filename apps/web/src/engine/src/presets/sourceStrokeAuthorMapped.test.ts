import {describe,expect,it} from 'vitest'
import {isSourceStampData,SOURCE_STAMP_MAPPED_COMPILER_PROFILE,type BrushDescriptor} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native.js'
import native from './fixtures/sourceCurveSensorFused.native.json'
import packets from './fixtures/sourceSensors.native.json'
import {sourceStrokeAuthorDescriptor} from './sourceStrokeAuthorDescriptor'
import {compileSourceOptionProgram} from './sourceOptionProgram'

function descriptor() {
  const data=structuredClone(stock.rows.find(r=>r.index===6)!.descriptor)
  const compiled=data.sourceStamp.compiled
  const curves=compiled.curves.map(entry=>{
    const captured=native.curves.find(row=>JSON.stringify(row.points)===JSON.stringify(entry.source.points))
    if(!captured)throw Error('Missing independent original curve')
    return {source:entry.source,coefficients:captured.coefficients}
  })
  return {...data,sourceStamp:{...data.sourceStamp,compiled:{version:2,reader:data.sourceStamp.reader,
    profile:SOURCE_STAMP_MAPPED_COMPILER_PROFILE,buildId:'5c6b74ca30b91f2c2529e6096f4230bec55e5056550b306734b2e9934a35d097',curves}}} as unknown as BrushDescriptor
}
describe('mapped descriptor sensor arithmetic',()=>{
  it('selects fused tables from the retained profile through the actual author adapter',()=>{
    const d=descriptor()
    expect(isSourceStampData(d.sourceStamp)).toBe(true)
    const result=sourceStrokeAuthorDescriptor(d,{colorIdentity:'rgba8:0,0,0,255',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
    expect(result.supported).toBe(true)
    if(!result.supported)throw Error(result.reasons.join(','))
    let checked=0
    for(const option of Object.values(result.program.roles[0].options)) {
      const bound=compileSourceOptionProgram(option).bind(packets.cases[0].input)
      for(let i=0;i<option.sensors.length;i++) {
        const sensor=option.sensors[i]
        if(sensor.curve.arithmetic==='installed-arm64-fused-v1') {
          const row=native.curves.find(row=>JSON.stringify(row.points.map(p=>({x:p.x,y:p.y})))===JSON.stringify(sensor.curve.points.map(p=>({x:p.x,y:p.y}))))
          expect(row).toBeDefined();expect(bound.sensors[i].transfer).toEqual(row!.samples);checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
  it('keeps an explicitly supplied legacy compiler callback on its declared arithmetic',()=>{
    const result=sourceStrokeAuthorDescriptor(descriptor(),{colorIdentity:'rgba8:0,0,0,255',lodScale:1,coverageProfile:'neon64-f32-fma-v1',
      compileCurve:source=>{const row=native.curves.find(r=>JSON.stringify(r.points)===JSON.stringify(source.points));return row?{version:'native-sparselu-v1',coefficients:row.coefficients.map(c=>[c[0],c[1],c[2],c[3]] as const)}:undefined}})
    expect(result.supported).toBe(true)
    if(!result.supported)throw Error(result.reasons.join(','))
    expect(Object.values(result.program.roles[0].options).flatMap(o=>o.sensors).every(s=>s.curve.arithmetic===undefined)).toBe(true)
  })
})

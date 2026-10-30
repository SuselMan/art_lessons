import {describe,expect,it} from 'vitest'
import original from './fixtures/sourceSoftAutoData/stock.native.js'
import {isSourceStampData,sourceStampDataBudget,sourceStampRequiredCurves,SOURCE_STAMP_MAPPED_COMPILER_PROFILE,type SourceStampCurveData} from './sourceStampData.js'

// Schema probes use dummy numeric coefficients; they do not attest a compiler.
function mappedData() {
  const data:unknown=structuredClone(original.rows.find(r=>r.index===72)!.sourceStamp)
  if(!isSourceStampData(data) || data.version!==2 || data.source.kind!=='softAuto')throw Error('Invalid original soft source')
  const entry=(source:SourceStampCurveData)=>({source,coefficients:Array.from({length:Math.max(1,source.points.length-1)},()=>[0,0,0,0])})
  const required=sourceStampRequiredCurves(data.options)
  return {...data,compiled:{version:2,reader:data.reader,profile:SOURCE_STAMP_MAPPED_COMPILER_PROFILE,buildId:'a'.repeat(64),
    curves:required.map(source=>entry(structuredClone(source))),radialCurve:entry(structuredClone(data.source.softnessCurve))}}
}
describe('mapped source dictionary schema',()=>{
  it('binds sensor and separate radial data, with matching variable budget',()=>{
    const data=mappedData()
    expect(isSourceStampData(data)).toBe(true)
    const entries=[...data.compiled.curves,data.compiled.radialCurve]
    const expected=entries.reduce((sum,e)=>sum+64+new TextEncoder().encode(e.source.text).length+32*e.source.points.length+32*e.coefficients.length,0)
    expect(sourceStampDataBudget(data)-sourceStampDataBudget({...data,compiled:undefined})).toBe(expected)
  })
  it('rejects unknown build/profile, missing radial, rebinding and wrong intervals',()=>{
    const data=mappedData()
    for(const patch of [{buildId:'not-a-build'},{profile:'eigen-3.4.0-sparselu-f64-no-fma-v1'},{version:1},{radialCurve:undefined},
      {radialCurve:{...data.compiled.radialCurve,coefficients:[]}},
      {radialCurve:{...data.compiled.radialCurve,source:{text:'0,0;1,1',points:[{x:0,y:0,corner:false},{x:1,y:1,corner:false}]}}},
      {extra:true}])expect(isSourceStampData({...data,compiled:{...data.compiled,...patch}})).toBe(false)
    expect(isSourceStampData({...data,source:{kind:'image'}})).toBe(false)
  })
})

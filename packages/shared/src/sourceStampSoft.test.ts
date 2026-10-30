import { describe, expect, it } from 'vitest'
import stock from './fixtures/sourceDefaultAutoData/stock.native.js'
import { isSourceStampData, sourceStampDataBudget, sourceStampSourceKind } from './sourceStampData.js'
import { extractCanonicalSinglePngCapability, extractDefaultAutoSourceDataCapability, extractGaussianAutoSourceDataCapability } from './canonicalBrushCapability.js'
import type { BrushDescriptor } from './brushes.js'

function softData() {
  const data=structuredClone(stock.rows[0].descriptor.sourceStamp)
  return {...data,source:{...data.source,kind:'softAuto',generator:'soft',shape:'circle',
    softnessCurve:{text:'0,1;.5,.4,is_corner;1,0',points:[{x:0,y:1,corner:false},{x:.5,y:.4,corner:true},{x:1,y:0,corner:false}]}}}
}
describe('raw soft source retention',()=>{
  it('retains a fourth explicit source kind without granting another renderer',()=>{
    const data=softData()
    expect(isSourceStampData(data)).toBe(true)
    if(isSourceStampData(data))expect(sourceStampSourceKind(data)).toBe('softAuto')
    const descriptor={...stock.rows[0].descriptor,sourceStamp:data} as unknown as BrushDescriptor
    expect(extractCanonicalSinglePngCapability(descriptor,{id:'asset:'+'a'.repeat(64),size:64})).toEqual({supported:false,reasons:['source-material-is-not-image']})
    expect(extractDefaultAutoSourceDataCapability(descriptor).supported).toBe(false)
    expect(extractGaussianAutoSourceDataCapability(descriptor).supported).toBe(false)
  })
  it('binds raw curve text, points, source tag and initial geometry',()=>{
    const data=softData()
    for(const patch of [{generator:'gauss'},{shape:'rect'},{kind:'gaussianAuto'},{unknown:1},
      {softnessCurve:{...data.source.softnessCurve,text:'0,1;.5,.5,is_corner;1,0'}},
      {softnessCurve:{...data.source.softnessCurve,points:[]}},
      {softnessCurve:{...data.source.softnessCurve,text:'0,1;1,NaN'}},
      {diameter:data.source.diameter+10}])expect(isSourceStampData({...data,source:{...data.source,...patch}})).toBe(false)
    expect(isSourceStampData({...data,version:1})).toBe(false)
    expect(isSourceStampData({...data,brush:{...data.brush,scale:2}})).toBe(false)
    expect(isSourceStampData({...data,source:{...data.source,spikes:9,antialias:true,randomness:.5}})).toBe(true)
  })
  it('accounts variable curve data before accepting the source payload',()=>{
    const data=softData(),{softnessCurve,...source}=data.source
    const baseline={...data,source:{...source,kind:'defaultAuto',generator:'default'}}
    const unicode={...data,source:{...data.source,softnessCurve:{...softnessCurve,text:'я'}}}
    expect(sourceStampDataBudget(unicode)-sourceStampDataBudget(baseline)).toBe(2+32*softnessCurve.points.length)
    expect(sourceStampDataBudget(data)-sourceStampDataBudget(baseline)).toBe(new TextEncoder().encode(softnessCurve.text).length+32*softnessCurve.points.length)
    for(const curve of [{...softnessCurve,text:'x'.repeat(65537)},{...softnessCurve,points:Array(257).fill(softnessCurve.points[0])}]) {
      expect(sourceStampDataBudget({...data,source:{...data.source,softnessCurve:curve}})).toBe(Infinity)
      expect(isSourceStampData({...data,source:{...data.source,softnessCurve:curve}})).toBe(false)
    }
  })
})

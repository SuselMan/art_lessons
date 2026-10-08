import {expect,it} from 'vitest'
import {CanonicalWatercolorSettlePlan} from '../raster/CanonicalWatercolorSettlePlan'
import {traceFixture} from '../raster/CanonicalWatercolorSettlePlan.fixture'
function trace(half:boolean,mixed:boolean,policy:'absent'|'off'|'paired'){
 const f=traceFixture(half,mixed,true,true,true),passes=f.context.passes();let pairs=0,attempts=0
 if(policy!=='absent')passes.carryPair=(outP,p,outC,c,fixed,k,options)=>{
  attempts++;if(policy==='off')return false
  // Logical expansion records the original OLD-field contract, not GPU pixels.
  expect(outP).not.toBe(p);expect(outC).not.toBe(c);expect(outP).not.toBe(outC)
  passes.fieldOp(outC,c,fixed,16,k,{...options,c:p});passes.fieldOp(outP,p,fixed,15,k,options);pairs++;return true
 }
 const planner=new CanonicalWatercolorSettlePlan(f.context),job=planner.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0,contentRect:null}],{minX:f.width/2-12,minY:f.width/2-12,maxX:f.width/2+12,maxY:f.width/2+12},.2,half?400:8,1,1,1,1)!
 for(const op of job.ops)op();job.finish();job.dispose();planner.destroyTextures()
 return{events:f.events,pairs,attempts}
}
it.each([false,true])('paired planner expands to identical full operation/ownership trace half=%s',half=>{
 const base=trace(half,true,'absent'),off=trace(half,true,'off'),paired=trace(half,true,'paired')
 expect(off.events).toEqual(base.events);expect(paired.events).toEqual(base.events)
 expect(off.pairs).toBe(0);expect(paired.pairs).toBeGreaterThan(0);expect(off.attempts).toBe(paired.pairs)
})
it('single-colour branch retains original calls and never requests an absent colour pair',()=>{
 const base=trace(false,false,'absent'),paired=trace(false,false,'paired')
 expect(paired.events).toEqual(base.events);expect(paired.attempts).toBe(0)
})

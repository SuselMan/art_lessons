import {it,expect} from 'vitest'
import {CanonicalWatercolorSettlePlan} from '../raster/CanonicalWatercolorSettlePlan'
import {traceFixture} from '../raster/CanonicalWatercolorSettlePlan.fixture'
it('reports conservative long400 material pass estimate without executing GPU',()=>{
 let max=0
 for(const radius of [120,160,200])for(const mixed of [false,true])for(const film of [false,true])for(const foreign of [false,true]){
  const f=traceFixture(false,mixed,film,foreign,true,1024)
  f.context.paperWorldSize=()=>({w:1754,h:2480})
  Object.assign(f.scratch,{brushTravel:Array.from({length:31},(_,i)=>({x:300+(i<=15?i:30-i)*20,y:400,radius,aspect:1,angle:0,dx:i<=15?20:-20,dy:0,water:1}))})
  const builder=new CanonicalWatercolorSettlePlan(f.context)
  const plan=builder.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0,contentRect:null}],{minX:100,minY:200,maxX:800,maxY:600},1,200,1,1,1,1,0,undefined,false,undefined,true)!
  expect(plan).toBeTruthy();for(const op of plan.ops)op();plan.finish();plan.dispose();builder.destroyTextures()
  const names=['clear','fieldOp','pigmentColor','costDomain','front','diffuse','resample','brush']
  const passes=f.events.filter(e=>names.includes(e[0] as string)).length
  max=Math.max(max,passes)
  process.stdout.write('timestamp-capacity '+JSON.stringify({radius,mixed,film,foreign,ops:plan.ops.length,passes})+'\n')
 }
 process.stdout.write('timestamp-capacity-max-material '+max+'\n')
 // Estimate only; not a full actual input fingerprint or quality proof.
 expect(max).toBeGreaterThan(0)
})

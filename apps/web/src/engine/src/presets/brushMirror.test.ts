import{it,expect}from'vitest'
import{isBrushBehavior,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
import{DIGITAL_BRUSHES}from'./digitalBrushPresets'
const input:Dab={x:10,y:10,size:20,pressure:.5,tiltX:0,tiltY:0,angle:.3,aspectRatio:1,opacity:1,t:0}
const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],scatter:undefined,behavior:{version:2,mirror:{horizontal:true,vertical:true,value:1,dynamics:[{control:'pressure',minimum:0,jitter:0}]}}}
it('uses the same threshold result on both enabled axes',()=>{
 for(const pressure of [0,.499,.5,1]){
  const dab={...input,pressure},stamp=behaviorStampsForDab(brush,dab,beginBrushBehavior(dab),[0,0,0])[0]
  expect([stamp.flipX,stamp.flipY]).toEqual(pressure>=.5?[-1,-1]:[1,1])
 }
})
it('keeps enabled axes and constant strength independent',()=>{
 const b={...brush,behavior:{version:2 as const,mirror:{horizontal:true,vertical:false,value:.499}}}
 expect(behaviorStampsForDab(b,input,beginBrushBehavior(input),[0,0,0])[0].flipX).toBe(1)
 b.behavior.mirror.value=.5
 const stamp=behaviorStampsForDab(b,input,beginBrushBehavior(input),[0,0,0])[0]
 expect([stamp.flipX,stamp.flipY]).toEqual([-1,1])
})
it('preserves deterministic per-dab choices across network chunk sizes',()=>{
 const b={...brush,behavior:{...brush.behavior!,mirror:{...brush.behavior!.mirror!,dynamics:[{control:'random' as const,minimum:0,jitter:0}]}}}
 const dabs=Array.from({length:80},(_,i)=>({...input,x:10+i,y:10+i*.2,t:i*5}))
 const run=(batch:number)=>{const state=beginBrushBehavior(input),out=[];for(let i=0;i<dabs.length;i+=batch)for(const dab of dabs.slice(i,i+batch))out.push(...behaviorStampsForDab(b,dab,state,[0,0,0]).map(s=>[s.flipX,s.flipY]));return out}
 expect(run(1)).toEqual(run(17));expect(run(1).some(x=>x[0]===-1)).toBe(true);expect(run(1).some(x=>x[0]===1)).toBe(true)
})
it('rejects incomplete and unbounded mirror recipes',()=>{
 for(const mirror of [{horizontal:false,vertical:false,value:1},{horizontal:true,vertical:false,value:NaN},{horizontal:true,vertical:false,value:1,unknown:true}])expect(isBrushBehavior({version:2,mirror})).toBe(false)
 expect(isBrushBehavior(brush.behavior)).toBe(true)
})

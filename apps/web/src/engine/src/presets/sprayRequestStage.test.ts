import{SpraySourceAtlas}from'../dabs/SpraySourceAtlas'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{MockGL}from'../../testing/mockGL'
import{it,expect}from'vitest'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
import{brushExecutionContext}from'./brushExecutionContext'
import{stageSpraySourceRequest,type SprayRequestState}from'./sprayRequestStage'
const lut=Array.from({length:257},(_,i)=>Math.round(i/256*65535).toString(16).padStart(4,'0')).join('')
const brush:BrushDescriptor={id:'own-spray-source-unit',version:71,model:'stamp',category:'scatter',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],pressureSmoothingPx:0,opacity:1,behavior:{version:2},spray:{version:1,diameter:20,scale:1,aspect:1,angle:0,count:3,jitter:0,radial:{maximum:1,samples:lut},angular:lut,particle:{shape:'ellipse',width:2,height:2,proportional:false},dynamics:{randomSize:false,fixedAngle:0,randomAngle:0,radialAngle:0,pathAngle:0},color:{perParticle:true,hue:0,saturation:0,value:0,randomOpacity:true,sampleInput:true,fillBackground:true}}}
const dab:Dab={x:10,y:20,size:20,pressure:.5,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
function state():SprayRequestState{return beginBrushBehavior(dab,brushExecutionContext(undefined,{version:1,background:[10,20,30,255]}))}
const expand=(b:BrushDescriptor,d:Dab)=>(working:SprayRequestState)=>({stamps:behaviorStampsForDab(b,d,working,[1,0,0]),geometry:{x:d.x,y:d.y,radius:10}})
it('stages actual geometry without consuming counters/carry until source collection succeeds, preserving issued execution identity',()=>{
 const original=state(),before=structuredClone({...original,execution:undefined}),stage=stageSpraySourceRequest(brush,original,expand(brush,dab))
 expect({...original,execution:undefined}).toEqual(before);expect(stage.working.execution).toBe(original.execution);expect(stage.prepared.stamps).toHaveLength(3);expect(stage.background?.opacity).toBe(1)
 stage.cancel();expect({...original,execution:undefined}).toEqual(before);expect(()=>stage.commit()).toThrow('closed')
 const retry=stageSpraySourceRequest(brush,original,expand(brush,dab));expect(retry.prepared).toEqual(stage.prepared);retry.commit();expect(original.dabSequence).toBe(1);expect(original.sprayPainterOpacity).toBe(retry.working.sprayPainterOpacity);expect(()=>retry.commit()).toThrow('closed')
})
it('keeps request metadata and previous painter opacity for zero-count background without fake particles',()=>{
 const original=state();original.sprayPainterOpacity=.2;const zero={...brush,spray:{...brush.spray!,count:0}},stage=stageSpraySourceRequest(zero,original,expand(zero,dab))
 expect(stage.prepared.stamps).toEqual([]);expect(stage.background).toEqual({x:10,y:20,radius:10,opacity:.2});expect(original.dabSequence).toBeUndefined();stage.commit();expect(original.dabSequence).toBe(1);expect(original.sprayPainterOpacity).toBe(.2)
})
it('does not mutate original nested caches when expansion/source failure occurs; rejects stale commit',()=>{
 const original=state();original.strokeRandomCache={seed:1,values:[['first',.1]]};const before=structuredClone({...original,execution:undefined})
 expect(()=>stageSpraySourceRequest(brush,original,working=>{working.strokeRandomCache!.values.push(['failed',.2]);working.dabSequence=99;throw undefined})).toThrow()
 expect({...original,execution:undefined}).toEqual(before)
 const stage=stageSpraySourceRequest(brush,original,expand(brush,dab));original.dabSequence=7;expect(()=>stage.commit()).toThrow('changed');expect(original.dabSequence).toBe(7)
})
it('does not broaden historical requests or unrelated family state',()=>{
 const old={...brush,spray:{...brush.spray!,color:{perParticle:true,hue:0,saturation:0,value:0,randomOpacity:false}}}
 expect(()=>stageSpraySourceRequest(old,state(),expand(old,dab))).toThrow('isolated')
 const original=state(),stage=stageSpraySourceRequest(brush,original,expand(brush,dab));expect(stage.working).not.toBe(original);stage.working.strokeRandomCache={seed:9,values:[]};expect(original.strokeRandomCache).toBeUndefined()
})

it('rolls back an actual staged request after source collection throws undefined and retries identical placements',()=>{
 const original=state(),before=structuredClone({...original,execution:undefined}),stage=stageSpraySourceRequest(brush,original,expand(brush,dab)),gl=new MockGL()as unknown as WebGLRenderingContext,atlas=new SpraySourceAtlas(gl);let released=0,caught=false
 try{try{atlas.collect(stage.prepared.stamps.map(s=>({x:s.x,y:s.y})),{cellWidth:8,cellHeight:8,assertCurrent(){},acquire(size){const buffer=new AccumulationBuffer(gl,size,size);return{buffer,release(){released++;buffer.destroy()}}},resolveCells(){throw undefined}})}catch(error){caught=true;expect(error).toBeUndefined();stage.cancel()}
 expect(caught).toBe(true);expect(released).toBe(1);expect({...original,execution:undefined}).toEqual(before);expect(stageSpraySourceRequest(brush,original,expand(brush,dab)).prepared).toEqual(stage.prepared)
 }finally{atlas.destroy()}
})

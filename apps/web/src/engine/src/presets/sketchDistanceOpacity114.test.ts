import{expect,it,vi}from'vitest'
import{SketchLineBatch}from'../dabs/SketchLineBatch'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{BehaviorPlaced}from'./brushBehavior'
import{isBrushLibrary,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{digitalBrushFromPreset,brushDabRandom}from'./digitalBrushPresets'
import{installBrushPixels}from'./importedBrushes'
import{prepareSketchMask,type SketchMaskView}from'./sketchMask'
import{sketchStamps,type SketchState}from'./brushSketch'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
const id=`asset:${'114'.padEnd(64,'0')}`as const
const dab:Dab={x:0,y:0,size:10,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0}
const controls={width:1,offset:1,probability:1}
function brush():BrushDescriptor{const b=structuredClone(digitalBrushFromPreset('hard-round'));b.version=114;b.id='imported-'+('4'.repeat(24));b.model='stamp';b.paperInteraction=0;b.tip={kind:'bitmap',mask:id,maskBounds:{x:0,y:0,width:1,height:1},hardness:1,aspect:1,angle:0,rotation:'fixed'};b.behavior={version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'normal'}};b.sketch={version:1,mode:'mask',maskSize:[4,4],width:1,offset:.3,probability:1,connect:false,magnetify:true,randomRGB:false,randomOpacity:false,distanceDensity:false,distanceOpacity:true,distanceOpacityPolicy:'generic-clamp-v1',antialias:false};return b}
function state(x:number,y:number):SketchState{return{points:[{x,y,ordinal:0}],cells:new Map([[`${Math.floor(x/32)},${Math.floor(y/32)}`,new Set([0])]]),ordinal:1,color:[1,0,0],alpha:1}}
// Independent selected-candidate view isolates signed rounding boundaries from
// browser mask interpolation; radius²25 and exact rational ratios below.
const selected:SketchMaskView={forDab:()=>({left:-10,top:-10,width:20,height:20,radius:5,contains:()=>true})}
it('114 clamps the negative rectangle corner only after signed Qt5 factor and retains .5/1.5 half-up boundaries',()=>{
 const b=brush();for(const [x,y,expected]of[[-4.4,-4.4,0],[2.5,2.5,1],[2.5,Math.sqrt(31.25),0],[0,0,1]]as const){const s=state(x,y),out=sketchStamps(b,dab,s,[1,0,0],42,controls,.25,selected);expect(out[0].flowScale).toBe(expected);expect(out.every(v=>v.flowScale>=0&&v.flowScale<=1)).toBe(true);expect(out.every(v=>v.groupOpacity===.25)).toBe(true)}
})
it('uses real captured corner and rotated nonsquare gate without adding a circle clip',()=>{
 const b=brush();installBrushPixels(id,new Uint8Array(16).fill(255));const v=prepareSketchMask(b)!;expect(v.forDab(dab).contains(-4.4,-4.4)).toBe(true);const a=sketchStamps(b,dab,state(-4.4,-4.4),[1,0,0],42,controls,1,v);expect(a[0].segmentLength).toBeGreaterThan(0);expect(a[0].flowScale).toBe(0)
 b.sketch!.maskSize=[4,2];const nonsquare=`asset:${'115'.padEnd(64,'0')}`as const;b.tip.mask=nonsquare;installBrushPixels(nonsquare,new Uint8Array([0,0,0,0,255,255,255,255,255,255,255,255,0,0,0,0]));const rotated={...dab,angle:Math.PI/2,x:-16,y:-16},view=prepareSketchMask(b)!;expect(view.forDab(rotated).height).toBe(10);expect(view.forDab(rotated).contains(-16,-19)).toBe(true);expect(sketchStamps(b,rotated,state(-16,-19),[1,0,0],42,controls,1,view)[0].flowScale).toBe(1)
})
it('preserves random sequence and previous effective opacity on the initial direct connection',()=>{
 const b=brush();b.sketch!.randomOpacity=true;b.sketch!.randomRGB=true;const s=state(-4.4,-4.4),seed=42;sketchStamps(b,dab,s,[1,0,0],seed,controls,1,selected)
 // Last candidate is current point ordinal1, so its random(4) survives in carry.
 const random=(salt:number)=>brushDabRandom((seed^Math.imul(2,0x9e3779b9))>>>0,Math.imul(2,8)+salt)
 expect(s.alpha).toBe(random(4));expect(s.color).toEqual([random(1),0,0])
 b.sketch!.connect=true;const carry=s.alpha,colour=[...s.color],next=sketchStamps(b,{...dab,x:1},s,[1,0,0],seed,controls,.5,selected);expect(next[0].flowScale).toBe(carry);expect(next[0].color).toEqual(colour);expect(next[0].groupOpacity).toBe(.5)
})
it('rejects missing or downgraded policy before mutable candidate state even when handed a prepared view',()=>{for(const mutate of[(b:BrushDescriptor)=>{b.version=113},(b:BrushDescriptor)=>{delete b.sketch!.distanceOpacityPolicy},(b:BrushDescriptor)=>{b.sketch!.distanceOpacity=false}]){const b=brush();mutate(b);const s=state(1,1),before=structuredClone(s);expect(()=>sketchStamps(b,dab,s,[1,0,0],42,controls,1,selected)).toThrow('policy');expect(s).toEqual(before)}})
it('shared admission closes policy/revision/simple/disabled/child while old101 retains absent marker',()=>{
 const b=brush(),lib=()=>({schemaVersion:1,assets:[{id,size:4,file:id.slice(6)+'.bin'}],brushes:[{name:'114',source:'Own.kpp',warnings:[],descriptor:b}],skipped:[]});expect(isBrushLibrary(lib())).toBe(true)
 b.version=113;expect(isBrushLibrary(lib())).toBe(false);b.version=114;delete b.sketch!.distanceOpacityPolicy;expect(isBrushLibrary(lib())).toBe(false);b.sketch!.distanceOpacity=false;b.version=101;expect(isBrushLibrary(lib())).toBe(true)
 b.sketch!.distanceOpacityPolicy='generic-clamp-v1';expect(isBrushLibrary(lib())).toBe(false)
 const parent=structuredClone(digitalBrushFromPreset('hard-round'));parent.id='imported-'+('5'.repeat(24));parent.version=114;parent.behavior={version:2,dual:{brush:brush(),blendMode:'normal'}};expect(isBrushLibrary({...lib(),brushes:[{name:'parent',source:'Own.kpp',warnings:[],descriptor:parent}]})).toBe(false)
})

it('rejects an invalid marker before whole behavior state even with supplied prepared sampler',()=>{const b=brush();delete b.sketch!.distanceOpacityPolicy;const state=beginBrushBehavior(dab),before=structuredClone(state);expect(()=>behaviorStampsForDab(b,dab,state,[1,0,0],{sketchMask:selected})).toThrow('policy');expect(state).toEqual(before)})

it('existing request renderer keeps overlapping line alpha separate from one outer request-opacity application',()=>{
 const floats:Float32Array[]=[],uniforms:Array<[string,number]>=[],draws:number[]=[]
 const gl={ARRAY_BUFFER:1,FLOAT:2,STREAM_DRAW:3,TEXTURE0:4,TEXTURE_2D:5,TRIANGLES:6,useProgram:vi.fn(),bindBuffer:vi.fn(),uniform2f:vi.fn(),getUniformLocation:(_p:unknown,n:string)=>n,uniform1f:(n:string,v:number)=>uniforms.push([n,v]),getAttribLocation:()=>0,enableVertexAttribArray:vi.fn(),vertexAttribPointer:vi.fn(),bufferData:(_t:number,a:Float32Array)=>floats.push(a.slice()),drawArrays:(_t:number,_a:number,n:number)=>draws.push(n),disableVertexAttribArray:vi.fn(),activeTexture:vi.fn(),bindTexture:vi.fn(),uniform1i:vi.fn(),uniform4f:vi.fn()}as unknown as WebGLRenderingContext
 const batch=new SketchLineBatch(gl);vi.spyOn(batch,'prepare').mockImplementation(()=>{});for(const k of['program','composite','buffer','quad'])Reflect.set(batch,k,{})
 const surface=()=>({width:32,height:32,texture:{},clear:vi.fn(),beginDraw:vi.fn(),endDraw:vi.fn()})as unknown as AccumulationBuffer
 const b=brush(),whole=beginBrushBehavior(dab);const stamps=behaviorStampsForDab(b,dab,whole,[1,0,0],{sketchMask:selected});const stamp=stamps[0]
 const placed:BehaviorPlaced={...stamp,x:8,y:8,size:1,radius:.5,flow:.75,ceiling:.25,pressure:1,segmentLength:8,group:1,color:[1,0,0]}
 batch.paint([placed,{...placed,angle:Math.PI/2}],surface(),surface(),0,0,false)
 expect(draws).toEqual([12,6]);expect(uniforms.filter(([n])=>n==='u_opacity')).toEqual([['u_opacity',.25]])
 expect(floats).toHaveLength(1);for(let i=7;i<floats[0].length;i+=10)expect(floats[0][i]).toBe(.75)
})

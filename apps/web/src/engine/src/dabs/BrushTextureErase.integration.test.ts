import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {BrushContext} from './BrushPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from '../presets/pencilPresets'
import {digitalBrushFromPreset} from '../presets/digitalBrushPresets'
import {installBrushPixels} from '../presets/importedBrushes'
import {brushPreparationResources} from './BrushPreparation'
const ids=[1,2,3,4].map(n=>`asset:${String(n).repeat(64)}` as const)
for(const id of ids)installBrushPixels(id,new Uint8Array(64).fill(128))
function definition(id:typeof ids[number],eraseId:typeof ids[number],erase:boolean):BrushDescriptor{return {...digitalBrushFromPreset('hard-round'),version:77,model:'stamp',paperInteraction:0,flow:1,texture:{id,eraseId,strength:.5,periodPx:8,application:{mode:'multiply',soft:true}},tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},behavior:{version:2,erase,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
function fixture(){
 const grain:string[]=[],protectedKeys:string[][]=[],leases:{brush:BrushDescriptor;erase:boolean|undefined;ids:string[]}[]=[]
 const gl=new Proxy({}, {get:(_t,key)=>{if(key==='getUniformLocation')return (_p:unknown,name:string)=>name;if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;if(key==='getAttribLocation')return ()=>0;if(key==='getExtension')return ()=>null;if(String(key).startsWith('create'))return ()=>({});return ()=>{}}})as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext,()=>({})as WebGLTexture,id=>{grain.push(id);return {}as WebGLTexture},keys=>protectedKeys.push([...keys]),(brush,erase)=>{leases.push({brush,erase,ids:brushPreparationResources(brush,erase).map(r=>r.id)});return ()=>{}})
 painter.initGL()
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer),original=buffer(),coverage=buffer(),ceiling=buffer()
 function scratch():BehaviorScratch{const child=scratchFactory();return child}
 function scratchFactory():BehaviorScratch{
  let secondary:ReturnType<BehaviorScratch['brushSecondary']>|undefined
  return {getOrCreate:()=>({original,coverage}),brushCeiling:()=>ceiling,brushCeilingCopy:()=>ceiling,noteBrushEdgePx:()=>0,brushSecondary:()=>secondary??={scratch:scratchFactory(),sampling:{remaining:0},tile:()=>coverage}}as unknown as BehaviorScratch
 }
 const state=scratch(),target={resolveForPaint:()=>[{originX:0,originY:0,buffer:buffer(),contentRect:null}],markContentPainted:()=>{}}
 const points=[20,24].map((x):Dab=>({x,y:20,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:x}))
 const paint=(brush:BrushDescriptor)=>painter.paint(target,points,{sizeMultiplier:1}as PencilPreset,brush,{size:true,opacity:true},[1,0,0],state)
 return {paint,painter,state,grain,protectedKeys,leases}
}
it.each(['inline','independent']as const)('uses captured parent erase for %s child bindings, protection and matching resource leases',sampling=>{
 for(const erase of [false,true]){
  const parent=definition(ids[0],ids[1],erase),child=definition(ids[2],ids[3],!erase)
  parent.behavior={...parent.behavior!,dual:{brush:child,blendMode:'multiply',...(sampling==='independent'?{sampling:'independent' as const}:{})}}
  const f=fixture();f.paint(parent)
  const expected=[ids[erase?1:0],ids[erase?3:2]],other=[ids[erase?0:1],ids[erase?2:3]]
  for(const id of expected){expect(f.grain).toContain(id);expect(f.protectedKeys.flat().some(k=>k.includes(id))).toBe(true);expect(f.leases.flatMap(l=>l.ids)).toContain(id)}
  for(const id of other){expect(f.grain).not.toContain(id);expect(f.leases.flatMap(l=>l.ids)).not.toContain(id)}
  expect(f.leases.every(l=>l.erase===erase)).toBe(true)
 }
})
it('defaults standalone child preparation/rendering to its own recorded mode and retains mode through finish',()=>{
 const child=definition(ids[2],ids[3],true),f=fixture();f.paint(child);f.painter.finish(f.state)
 expect(f.grain).toContain(ids[3]);expect(f.grain).not.toContain(ids[2]);expect(f.leases.every(l=>l.erase===true)).toBe(true)
 expect(brushPreparationResources(child).some(r=>r.id===ids[3])).toBe(true);expect(brushPreparationResources(child,false).some(r=>r.id===ids[2])).toBe(true)
})
it('refuses unsupported wet primary or inline-child pairs instead of claiming prepared assets that Smudge does not bind',()=>{
 const wet={...definition(ids[0],ids[1],true),model:'mixer' as const}
 expect(()=>brushPreparationResources(wet)).toThrow('stamp renderer')
 const child=definition(ids[2],ids[3],false),parent:BrushDescriptor={...wet,texture:undefined,behavior:{version:2,erase:true,dual:{brush:child,blendMode:'multiply'}}}
 expect(()=>brushPreparationResources(parent)).toThrow('stamp renderer')
})

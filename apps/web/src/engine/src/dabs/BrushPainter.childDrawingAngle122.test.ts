import*as importedPixels from'../presets/importedBrushes'
import{it,expect,vi}from'vitest'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{brushPreparationPlan,brushPreparationResources,brushTextureResourceKey}from'./BrushPreparation'
import{nativeImageBank,nativeImageDomain,nativeImageUVShift,nativeImageResource}from'./NativeImageBank'
import{MockGL}from'../../testing/mockGL'
import{installBrushPixels}from'../presets/importedBrushes'
import{digitalBrushFromPreset}from'../presets/digitalBrushPresets'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{PencilPreset}from'../presets/pencilPresets'
const id=`asset:${'d'.repeat(64)}`as const
function pair():BrushDescriptor{
 const part=():BrushDescriptor=>({...digitalBrushFromPreset('hard-round'),version:122,scatter:undefined,spacing:.5,tip:{kind:'bitmap',mask:id,hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rotation:{follow:1,random:'none'},spacing:{mode:'diameter',coefficient:.5,isotropic:true},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}})
 const root=part(),child=part();child.tip.imageSampling={kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:0,y:1,width:4,height:2}};child.behavior!.rendering!.accumulation='alphaDarken';root.behavior!.dual={brush:child,sampling:'independent',blendMode:'multiply'};return root
}
function owner(){installBrushPixels(id,new Uint8Array([0,0,0,0,255,0,0,0,128,0,0,0,0,0,0,0]));const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext);painter.initGL();painter.prepareIntegerImages();return{gl,painter}}
const dab:Dab={x:-2.25,y:-3.25,size:4,pressure:1,opacity:1,angle:0,sourceAngle:Math.PI/2,aspectRatio:1,tiltX:0,tiltY:0,t:0}
function paint(painter:BrushPainter,brush:BrushDescriptor,scratch:BehaviorScratch){return painter.paint({resolveForPaint:()=>{throw Error('target reached')},markContentPainted:()=>{}}as unknown as ILayerBuffer,[dab],{sizeMultiplier:1}as PencilPreset,{brush,pressure:{size:true,opacity:true}},[1,0,0],scratch,undefined)}
function scratch(){return{getOrCreate:vi.fn(()=>{throw Error('scratch forbidden')}),brushSecondary:vi.fn(()=>{throw Error('child scratch forbidden')})}as unknown as BehaviorScratch}
it('actual facade rejects absent bank and invalid borrowed CAS rectangle BEFORE either scratch/state or GL upload',()=>{
 const{gl,painter}=owner();try{for(const kind of['absent','bounds']as const){const brush=pair();if(kind==='bounds')brush.behavior!.dual!.brush.tip.imageSampling!.sourceRect.x=1;const s=scratch(),upload=vi.spyOn(gl,'texImage2D'),draw=vi.spyOn(gl,'drawArrays');
 expect(()=>paint(painter,brush,s)).toThrow(kind==='absent'?'bank is not prepared':'rectangle exceeds');expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled();expect(s.brushSecondary).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();upload.mockRestore();draw.mockRestore()}
 }finally{painter.destroy()}
})
it('real prewarm prepares the complete recursive bank; cold/context reset fails closed and repeat prewarm restores readiness',()=>{
 const{gl,painter}=owner(),brush=pair(),plan=brushPreparationPlan(brush);try{expect(plan.capabilities).toContain('stampImage');const bank=nativeImageBank(id,brush.behavior!.dual!.brush.tip);expect(plan.resources.filter(r=>r.nativeImage).map(brushTextureResourceKey)).toEqual(bank.map(b=>b.key));const prewarm=()=>{painter.prepareIntegerImages();for(const resource of plan.resources)painter.prepareTexture(plan.resources,resource);expect(plan.resources.every(r=>painter.hasPreparedTexture(r))).toBe(true)};prewarm();const upload=vi.spyOn(gl,'texImage2D'),s=scratch();expect(()=>paint(painter,brush,s)).toThrow('child scratch forbidden');expect(s.brushBehavior).toBeDefined();expect(upload).not.toHaveBeenCalled();upload.mockRestore();painter.initGL();const cold=scratch();expect(()=>paint(painter,brush,cold)).toThrow('bank is not prepared');expect(cold.brushBehavior).toBeUndefined();prewarm();expect(()=>paint(painter,brush,scratch())).toThrow('child scratch forbidden')
 }finally{painter.destroy()}
})
it('actual leaseRequired union fails before state even when the complete pair itself fits',()=>{
 const{painter}=owner(),brush=pair();try{const resources=brushPreparationResources(brush);for(const resource of resources)painter.prepareTexture(resources,resource);const cache=painter['textures'],release=cache.leaseRequired([{key:'other-owned-request',bytes:16*1024*1024}]);try{const s=scratch();expect(()=>paint(painter,brush,s)).toThrow('lease exceeds budget');expect(s.brushBehavior).toBeUndefined();expect(s.brushSecondary).not.toHaveBeenCalled()}finally{release()}}finally{painter.destroy()}
})
it('same CAS with a distinct sourceRect has distinct keys/domain/UV instead of reusing old geometry',()=>{
 const a=pair().behavior!.dual!.brush.tip,b=structuredClone(a);b.imageSampling!.sourceRect={x:0,y:0,width:2,height:4};expect(nativeImageBank(id,a)[0].key).not.toBe(nativeImageBank(id,b)[0].key);expect(nativeImageDomain(a,-2.25,-3.25,2,2,Math.PI/2)).not.toEqual(nativeImageDomain(b,-2.25,-3.25,2,2,Math.PI/2));const selected=nativeImageResource(id,a,4)!;expect(nativeImageUVShift(selected,2,2,Math.PI/2).every(Number.isFinite)).toBe(true)
})
it('actual recursive image child draws its own captured direction/domain with no lazy upload',()=>{
 const{gl,painter}=owner(),brush=pair(),resources=brushPreparationResources(brush),stop=Error('actual child image draw');try{for(const resource of resources)painter.prepareTexture(resources,resource);const uniforms=new Map<string,number[]>();const u1=vi.spyOn(gl,'uniform1f'),u4=vi.spyOn(gl,'uniform4f');u1.mockImplementation((loc,v)=>{uniforms.set(loc.name,[v]);loc.program.uniforms.set(loc.name,v)});u4.mockImplementation((loc,...v)=>{uniforms.set(loc.name,v);loc.program.uniforms.set(loc.name,v)});const draw=vi.spyOn(gl,'drawArrays').mockImplementation(()=>{if(uniforms.get('u_tipImageEnabled')?.[0]===1)throw stop}),upload=vi.spyOn(gl,'texImage2D');
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}),rootBuffer=buffer(),childBuffer=buffer();const make=()=>({getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:()=>buffer(),brushCeilingCopy:()=>buffer(),noteBrushEdgePx:()=>0})as unknown as BehaviorScratch;const child=make(),s=make();s.brushSecondary=()=>({scratch:child,sampling:{remaining:0},tile:()=>childBuffer as unknown as AccumulationBuffer});const target={resolveForPaint:()=>[{originX:-32,originY:-32,buffer:rootBuffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer;
 expect(()=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,{brush,pressure:{size:true,opacity:true}},[1,0,0],s,undefined)).toThrow(stop);expect(uniforms.get('u_angle')).toEqual([Math.PI/2]);expect(uniforms.get('u_tipImageEnabled')).toEqual([1]);expect(uniforms.get('u_tipImageDomain')).toEqual([28,33,31,38]);expect(child.brushBehavior?.firstAngle).toBe(Math.PI/2);expect(upload).not.toHaveBeenCalled();draw.mockRestore();upload.mockRestore();u1.mockRestore();u4.mockRestore()
 }finally{painter.destroy()}
})
it('readiness failure preserves thrown undefined and releases the real required lease',()=>{
 const{painter}=owner(),brush=pair();try{const check=vi.spyOn(painter,'hasPreparedTexture').mockImplementation(()=>{throw undefined}),before=painter['textures']['leases'].size;let caught=false;try{paint(painter,brush,scratch())}catch(error){caught=true;expect(error).toBeUndefined()}expect(caught).toBe(true);expect(painter['textures']['leases'].size).toBe(before);check.mockRestore()}finally{painter.destroy()}
})

it('rejects borrowed non-POT and oversized raw planes before required lease, scratch or upload',()=>{
 const{gl,painter}=owner();try{for(const length of[9,4096*4096]){const borrowed=new Uint8Array(length),read=vi.spyOn(importedPixels,'importedAssetPixels').mockReturnValue(borrowed),lease=vi.spyOn(painter['textures'],'leaseRequired'),upload=vi.spyOn(gl,'texImage2D'),s=scratch();try{expect(()=>paint(painter,pair(),s)).toThrow('source plane is not canonical');expect(lease).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled();expect(s.brushSecondary).not.toHaveBeenCalled()}finally{read.mockRestore();lease.mockRestore();upload.mockRestore()}}}finally{painter.destroy()}
})

it('recorded cold owner API prepares before state and reuses warmed bank after context recovery',()=>{
 const{gl,painter}=owner(),brush=pair();try{const s=scratch();expect(()=>paint(painter,brush,s)).toThrow('not prepared');expect(s.brushBehavior).toBeUndefined();painter.prepareRecordedStampResources(brush);const resources=brushPreparationResources(brush);expect(resources.every(r=>painter.hasPreparedTexture(r))).toBe(true);const upload=vi.spyOn(gl,'texImage2D');expect(()=>paint(painter,brush,scratch())).toThrow('child scratch forbidden');painter.prepareRecordedStampResources(brush);expect(upload).not.toHaveBeenCalled();upload.mockRestore();painter.initGL();expect(()=>paint(painter,brush,scratch())).toThrow('not prepared');painter.prepareRecordedStampResources(brush);expect(()=>paint(painter,brush,scratch())).toThrow('child scratch forbidden')}finally{painter.destroy()}
})
it('recorded preflight refuses invalid CAS metadata before derivatives and old120 is no-op',()=>{
 const{gl,painter}=owner();try{const upload=vi.spyOn(gl,'texImage2D'),bad=pair();bad.behavior!.dual!.brush.tip.imageSampling!.sourceRect.x=1;expect(()=>painter.prepareRecordedStampResources(bad)).toThrow('rectangle exceeds');expect(upload).not.toHaveBeenCalled();const old=pair();old.version=120;delete old.behavior!.dual!.brush.tip.imageSampling;old.behavior!.dual!.brush.version=120;painter.prepareRecordedStampResources(old);expect(upload).not.toHaveBeenCalled();upload.mockRestore()}finally{painter.destroy()}
})

import*as importedPixels from'../presets/importedBrushes'
import{it,expect,vi}from'vitest'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{brushPreparationPlan,brushPreparationResources,brushTextureResourceKey}from'./BrushPreparation'
import{nativeImageBank}from'./NativeImageBank'
import{MockGL}from'../../testing/mockGL'
import{installBrushPixels}from'../presets/importedBrushes'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{PencilPreset}from'../presets/pencilPresets'
import{pair128,assets128,pixels128,mask128,gray128}from'../../../../../../packages/shared/src/childLightness128.testFixture'
const id=mask128,pair=pair128
function owner(){for(const a of assets128)installBrushPixels(a.id,pixels128(a.id));const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext);painter.initGL();return{gl,painter}}
const dab:Dab={x:-2.25,y:-3.25,size:4,pressure:1,opacity:1,angle:0,sourceAngle:Math.PI/2,aspectRatio:1,tiltX:0,tiltY:0,t:0}
function paint(painter:BrushPainter,brush:BrushDescriptor,scratch:BehaviorScratch){return painter.paint({resolveForPaint:()=>{throw Error('target reached')},markContentPainted:()=>{}}as unknown as ILayerBuffer,[dab],{sizeMultiplier:1}as PencilPreset,{brush,pressure:{size:true,opacity:true}},[1,0,0],scratch,undefined)}
function scratch(){return{getOrCreate:vi.fn(()=>{throw Error('scratch forbidden')}),brushSecondary:vi.fn(()=>{throw Error('child scratch forbidden')})}as unknown as BehaviorScratch}
it('actual facade rejects absent bank and invalid borrowed CAS rectangle BEFORE either scratch/state or GL upload',()=>{
 const{gl,painter}=owner();try{for(const kind of['absent','bounds']as const){const brush=pair();if(kind==='bounds')brush.behavior!.dual!.brush.tip.imageSampling!.sourceRect.x=1;const s=scratch(),upload=vi.spyOn(gl,'texImage2D'),draw=vi.spyOn(gl,'drawArrays');
 expect(()=>paint(painter,brush,s)).toThrow(kind==='absent'?'bank is not prepared':'source dimensions differ or exceed512');expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled();expect(s.brushSecondary).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();upload.mockRestore();draw.mockRestore()}
 }finally{painter.destroy()}
})
it('real prewarm prepares the complete recursive bank; cold/context reset fails closed and repeat prewarm restores readiness',()=>{
 const{gl,painter}=owner(),brush=pair(),plan=brushPreparationPlan(brush);try{expect(plan.capabilities).toContain('stampImage');const bank=nativeImageBank(id,brush.behavior!.dual!.brush.tip);expect(plan.resources.filter(r=>r.nativeImage).map(brushTextureResourceKey)).toEqual(bank.map(b=>b.key));const prewarm=()=>{painter.prepareRecordedStampResources(brush);expect(plan.resources.every(r=>painter.hasPreparedTexture(r))).toBe(true)};prewarm();const upload=vi.spyOn(gl,'texImage2D'),s=scratch();expect(()=>paint(painter,brush,s)).toThrow('child scratch forbidden');expect(s.brushBehavior).toBeDefined();expect(upload).not.toHaveBeenCalled();upload.mockRestore();painter.initGL();const cold=scratch();expect(()=>paint(painter,brush,cold)).toThrow('bank is not prepared');expect(cold.brushBehavior).toBeUndefined();prewarm();expect(()=>paint(painter,brush,scratch())).toThrow('child scratch forbidden')
 }finally{painter.destroy()}
})
it('actual leaseRequired union fails before state even when the complete pair itself fits',()=>{
 const{painter}=owner(),brush=pair();try{painter.prepareRecordedStampResources(brush);const cache=painter['textures'],release=cache.leaseRequired([{key:'other-owned-request',bytes:16*1024*1024}]);try{const s=scratch();expect(()=>paint(painter,brush,s)).toThrow('lease exceeds budget');expect(s.brushBehavior).toBeUndefined();expect(s.brushSecondary).not.toHaveBeenCalled()}finally{release()}}finally{painter.destroy()}
})
it('actual recursive image child draws its own captured direction/domain with no lazy upload',()=>{
 const{gl,painter}=owner(),brush=pair(),stop=Error('actual child image draw');try{painter.prepareRecordedStampResources(brush);const uniforms=new Map<string,number[]>();const u1=vi.spyOn(gl,'uniform1f'),u4=vi.spyOn(gl,'uniform4f');u1.mockImplementation((loc,v)=>{uniforms.set(loc.name,[v]);loc.program.uniforms.set(loc.name,v)});u4.mockImplementation((loc,...v)=>{uniforms.set(loc.name,v);loc.program.uniforms.set(loc.name,v)});const draw=vi.spyOn(gl,'drawArrays').mockImplementation(()=>{if(uniforms.get('u_tipImageEnabled')?.[0]===1)throw stop}),upload=vi.spyOn(gl,'texImage2D');
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}),rootBuffer=buffer(),childBuffer=buffer();const make=()=>({getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:()=>buffer(),brushCeilingCopy:()=>buffer(),noteBrushEdgePx:()=>0})as unknown as BehaviorScratch;const child=make(),s=make();s.brushSecondary=()=>({scratch:child,sampling:{remaining:0},tile:()=>childBuffer as unknown as AccumulationBuffer});const target={resolveForPaint:()=>[{originX:-32,originY:-32,buffer:rootBuffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer;
 expect(()=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,{brush,pressure:{size:true,opacity:true}},[1,0,0],s,undefined)).toThrow(stop);expect(uniforms.get('u_angle')).toEqual([Math.PI/2]);expect(uniforms.get('u_tipImageEnabled')).toEqual([1]);expect(uniforms.get('u_tipImageDomain')).toEqual([27,33,32,38]);expect(child.brushBehavior?.firstAngle).toBe(Math.PI/2);expect(upload).not.toHaveBeenCalled();draw.mockRestore();upload.mockRestore();u1.mockRestore();u4.mockRestore()
 }finally{painter.destroy()}
})
it('readiness failure preserves thrown undefined and releases the real required lease',()=>{
 const{painter}=owner(),brush=pair();try{const check=vi.spyOn(painter,'hasPreparedTexture').mockImplementation(()=>{throw undefined}),before=painter['textures']['leases'].size;let caught=false;try{paint(painter,brush,scratch())}catch(error){caught=true;expect(error).toBeUndefined()}expect(caught).toBe(true);expect(painter['textures']['leases'].size).toBe(before);check.mockRestore()}finally{painter.destroy()}
})

it('rejects borrowed non-POT and oversized raw planes before required lease, scratch or upload',()=>{
 const{gl,painter}=owner();try{for(const length of[9,1024*1024]){const borrowed=new Uint8Array(length),read=vi.spyOn(importedPixels,'importedAssetPixels').mockReturnValue(borrowed),lease=vi.spyOn(painter['textures'],'leaseRequired'),upload=vi.spyOn(gl,'texImage2D'),s=scratch();try{expect(()=>paint(painter,pair(),s)).toThrow('source dimensions differ or exceed512');expect(lease).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled();expect(s.brushSecondary).not.toHaveBeenCalled()}finally{read.mockRestore();lease.mockRestore();upload.mockRestore()}}}finally{painter.destroy()}
})

it('recorded cold owner API prepares before state and reuses warmed bank after context recovery',()=>{
 const{gl,painter}=owner(),brush=pair();try{const s=scratch();expect(()=>paint(painter,brush,s)).toThrow('not prepared');expect(s.brushBehavior).toBeUndefined();painter.prepareRecordedStampResources(brush);const resources=brushPreparationResources(brush);expect(resources.every(r=>painter.hasPreparedTexture(r))).toBe(true);const upload=vi.spyOn(gl,'texImage2D');expect(()=>paint(painter,brush,scratch())).toThrow('child scratch forbidden');painter.prepareRecordedStampResources(brush);expect(upload).not.toHaveBeenCalled();upload.mockRestore();painter.initGL();expect(()=>paint(painter,brush,scratch())).toThrow('not prepared');painter.prepareRecordedStampResources(brush);expect(()=>paint(painter,brush,scratch())).toThrow('child scratch forbidden')}finally{painter.destroy()}
})

it('128 rejects mismatched gray plans, skips unrecognized prewarm pairs, and rejects all invalid paints before state',()=>{
 const{gl,painter}=owner();
 const cases:Array<{name:string;edit:(b:BrushDescriptor)=>void;rejectPrepare:boolean}>=[
  {name:'grayMismatch',edit:()=>{},rejectPrepare:true},
  {name:'invalidBounds',edit:b=>{b.tip.maskBounds!.x=.5},rejectPrepare:false},
  {name:'oldVersion',edit:b=>{b.version=127},rejectPrepare:false},
 ];
 try{for(const item of cases){
  const b=pair();item.edit(b);
  const raw=vi.spyOn(importedPixels,'importedAssetPixels').mockImplementation(key=>item.name==='grayMismatch'&&key===gray128?new Uint8Array(64):pixels128(key));
  const lease=vi.spyOn(painter['textures'],'leaseRequired'),upload=vi.spyOn(gl,'texImage2D'),draw=vi.spyOn(gl,'drawArrays');
  try{
   if(item.rejectPrepare)expect(()=>painter.prepareRecordedStampResources(b)).toThrow();
   else expect(()=>painter.prepareRecordedStampResources(b)).not.toThrow();
   expect(lease).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();
   const s=scratch();expect(()=>paint(painter,b,s)).toThrow();
   expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled();expect(s.brushSecondary).not.toHaveBeenCalled();
   expect(lease).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();
  }finally{raw.mockRestore();lease.mockRestore();upload.mockRestore();draw.mockRestore()}
 }}finally{painter.destroy()}
})

it('actual SAME painter keeps Lightness/Wash root pigment and combines independent alpha with darken at final target',()=>{const{gl,painter}=owner(),brush=pair(),stop=Error('final128composite');try{painter.prepareRecordedStampResources(brush);const uniforms=new Map<string,number[]>(),seen:{material:boolean;image:boolean}={material:false,image:false};const one=vi.spyOn(gl,'uniform1f').mockImplementation((loc,v)=>{uniforms.set(loc.name,[v]);loc.program.uniforms.set(loc.name,v)}),draw=vi.spyOn(gl,'drawArrays').mockImplementation(()=>{if(uniforms.get('u_lightnessMaterial')?.[0]===1)seen.material=true;if(uniforms.get('u_tipImageEnabled')?.[0]===1)seen.image=true;if(uniforms.get('u_secondaryEnabled')?.[0]===1)throw stop});const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer),rootBuffer=buffer(),childBuffer=buffer();const make=()=>({getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:buffer,brushCeilingCopy:buffer,noteBrushEdgePx:()=>0})as unknown as BehaviorScratch,child=make(),scratch=make();scratch.brushSecondary=()=>({scratch:child,sampling:{remaining:0},tile:()=>childBuffer});const target={resolveForPaint:()=>[{originX:-32,originY:-32,buffer:rootBuffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer,upload=vi.spyOn(gl,'texImage2D');expect(()=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,{brush,pressure:{size:true,opacity:true}},[.8,.2,.1],scratch,undefined)).toThrow(stop);expect(seen).toEqual({material:true,image:true});expect(uniforms.get('u_secondaryMode')).toEqual([4]);expect(uniforms.get('u_secondaryEnabled')).toEqual([1]);expect(uniforms.get('u_physicalAccumulation')).toEqual([1]);expect(uniforms.get('u_lightnessStrength')).toEqual([1]);expect(upload).not.toHaveBeenCalled();one.mockRestore();draw.mockRestore();upload.mockRestore()}finally{painter.destroy()}})

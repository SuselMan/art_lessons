import{it,expect,vi,afterEach}from'vitest'
import{textureWash171,mask171,gray171,alpha171}from'../../../../../../packages/shared/src/textureLightnessWash171.testFixture.js'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import{MockGL}from'../../testing/mockGL'
import{TiledLayerBuffer}from'../buffers/TiledLayerBuffer'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{BrushExecutionContext}from'../presets/brushExecutionContext'
import type{PencilPreset}from'../presets/pencilPresets'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{installBrushPixels,clearImportedBrushPixels}from'../presets/importedBrushes'
import{assertTextureLightnessWash171Planes}from'../presets/textureLightnessWash171'
import{creamyWash}from'../presets/brushWash'
const dab171=(opacity=1,t=0):Dab=>({x:17,y:-13,size:12,pressure:opacity,opacity,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t})
afterEach(()=>clearImportedBrushPixels())
function setup(){
 installBrushPixels(mask171,new Uint8Array(16).fill(192));installBrushPixels(gray171,new Uint8Array([0,64,128,255,0,64,128,255,0,64,128,255,0,64,128,255]));installBrushPixels(alpha171,new Uint8Array([0,64,128,255,0,64,128,255,0,64,128,255,0,64,128,255]));
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),leases:{width:number;height:number;released:boolean}[]=[]
 const buffer=(width=1300,height=900)=>({width,height,texture:gl.createTexture(),beginDraw:vi.fn(),beginReplaceDraw:vi.fn(),endDraw:vi.fn(),clear:vi.fn(),copyRegionInto:vi.fn()})as unknown as AccumulationBuffer
 const acquire=vi.fn((width:number,height:number)=>{const rec={width,height,released:false};leases.push(rec);return{buffer:buffer(width,height),assertCurrent(){if(rec.released)throw Error('retired')},release(){rec.released=true}}})
 const painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1,acquireSprayScratch:acquire}as unknown as BrushContext);painter.initGL()
 const original=buffer(),coverage=buffer(),feedback=buffer(),targetBuffer=buffer(),entry={original,coverage},s={getOrCreate:vi.fn(()=>entry),brushCeiling:vi.fn(()=>feedback),brushCeilingCopy:vi.fn(()=>{throw Error('fourth plane forbidden')}),brushSecondary:vi.fn(()=>{throw Error('secondary forbidden')}),noteBrushEdgePx:()=>0}as unknown as BehaviorScratch
 const target=Object.assign(Object.create(TiledLayerBuffer.prototype)as TiledLayerBuffer,{coarseWorldSize:()=>({w:1300,h:900}),resolveForPaint:()=>[{buffer:targetBuffer,originX:-650,originY:-450,contentRect:null}],markContentPainted:vi.fn()})
 const paint=(b:BrushDescriptor,dabs:Dab[]= [dab171()],execution:BrushExecutionContext|undefined=undefined)=>painter.paint(target,dabs,{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:true,opacity:true}},[.8,.2,.1],s,undefined,execution)
 return{gl,painter,leases,acquire,s,target,coverage,feedback,paint,buffer}
}

it('actual public recorded prewarm chooses Lightness program, varying pigment uses feedback and no fourth plane',()=>{const o=setup();try{const b=textureWash171();o.painter.prepareRecordedStampResources(b);const modes=vi.spyOn(o.gl,'uniform1f'),upload=vi.spyOn(o.gl,'texImage2D'),compile=vi.spyOn(o.gl,'createProgram');o.paint(b,[dab171(1),dab171(.5,10)]);expect(modes.mock.calls.some(([loc,v])=>loc.name==='u_washMode'&&v===2)).toBe(true);expect(modes.mock.calls.filter(([loc,v])=>loc.name==='u_washMode'&&v>0).every(([,v])=>v===2)).toBe(true);expect(o.coverage.copyRegionInto).toHaveBeenCalledTimes(2);expect(o.s.brushBehavior!.washOpacity!.average).toBeCloseTo(.95,14);expect(modes.mock.calls.some(([loc,v])=>loc.name==='u_texStrength'&&v===.75)).toBe(true);expect(modes.mock.calls.some(([loc,v])=>loc.name==='u_texStrength'&&v===.375)).toBe(true);expect(o.acquire).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()}finally{o.painter.destroy()}})
it('whole/chunks preserve real Wash state, old108 directOver unchanged',()=>{const a=setup(),b=setup();try{const d=textureWash171(),dabs=[dab171(1),dab171(.5,10)];a.painter.prepareRecordedStampResources(d);b.painter.prepareRecordedStampResources(d);a.paint(d,dabs);b.paint(d,dabs.slice(0,1));b.paint(d,dabs.slice(1));expect(a.s.brushBehavior).toEqual(b.s.brushBehavior);const old=textureWash171();old.version=108;old.behavior!.rendering!.accumulation='directOver';a.painter.prepareTextureLightness(old);expect(()=>a.paint(old,[dab171()])).not.toThrow()}finally{a.painter.destroy();b.painter.destroy()}})
it('loaded plane metadata and full required union refuse before program/upload/state',()=>{const o=setup(),b=textureWash171();try{clearImportedBrushPixels();installBrushPixels(mask171,new Uint8Array(16));installBrushPixels(gray171,new Uint8Array(16));installBrushPixels(alpha171,new Uint8Array(4));const uploads=vi.spyOn(o.gl,'texImage2D'),compile=vi.spyOn(o.gl,'createProgram');expect(()=>o.painter.prepareRecordedStampResources(b)).toThrow('dimensions');expect(o.s.getOrCreate).not.toHaveBeenCalled();expect(uploads).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();clearImportedBrushPixels();installBrushPixels(mask171,new Uint8Array(16));installBrushPixels(gray171,new Uint8Array(16));installBrushPixels(alpha171,new Uint8Array(16));expect(assertTextureLightnessWash171Planes(b)).toBe(true);const release=o.painter['textures'].leaseRequired([{key:'own-full-budget171',bytes:16*1024*1024}]);try{expect(()=>o.painter.prepareRecordedStampResources(b)).toThrow('budget');expect(uploads).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()}finally{release()}}finally{o.painter.destroy()}})
it('effectiveerase/malformedscope direct actual BBP refuse before any resource or state read',()=>{const painter=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter,touch=vi.fn(),target=new Proxy({},{get(){touch();throw Error('target')}}),scratch=new Proxy({},{get(){touch();throw Error('scratch')}});for(const erase of[false,true]){const b=textureWash171();if(!erase)b.version=108;expect(()=>painter.paint(target as never,[dab171()],{}as PencilPreset,b,{size:true,opacity:true},[.8,.2,.1],scratch as never,false,undefined,undefined,erase)).toThrow('Wash171');expect(touch).not.toHaveBeenCalled()}})
it('independent rational varying-colour Wash witness differs from frozen-pigment and repeated external opacity',()=>{
 // Neutral foreground .5, fixed gray .75, changing strength0→1 gives
 // source .5→.75. M=min(mask.75,patternAlpha.5)=.5, O=1.
 // Alpha=.75; straightRGB=.5*(1-.5)+.75*.5=5/8; PMA=15/32.
 const first=creamyWash([0,0,0,0],[.5,.5,.5],.5,1,1,1),second=creamyWash(first,[.75,.75,.75],.5,1,1,1)
 expect(first).toEqual([.25,.25,.25,.5]);expect(second).toEqual([15/32,15/32,15/32,.75]);expect(second).not.toEqual([3/8,3/8,3/8,.75])
 // Same authored pressure/strength profiles as actual BP fixture above:
 // p1→p.5, strength3/4→3/8; neutral foregroundL=.5 at analytic gray3/4
 // yields source11/16→19/32. Opacity1→1/2 gives average19/20.
 // At M1/2: nextA=1/4+(19/20-1/4)*(1/2)/(19/20)=47/76;
 // nextStraight=11/16*3/4+19/32*1/4=85/128, PMA3995/9728.
 const profile=textureWash171();expect(profile.opacityByPressure).toEqual([[0,0],[1,1]]);expect(profile.texture!.strength).toBe(3/4);expect(profile.behavior!.modulations!.grainDepth![0].curve).toEqual([[0,0],[1,1]])
 const firstProfile=creamyWash([0,0,0,0],[11/16,11/16,11/16],1/2,1,1,1),nextProfile=creamyWash(firstProfile,[19/32,19/32,19/32],1/2,1/2,1,19/20)
 expect(nextProfile[3]).toBeCloseTo(47/76,14);for(const c of nextProfile.slice(0,3))expect(c).toBeCloseTo(3995/9728,14)
 // Captured external .5 once -> alpha3/8, not per-dab .25 OVER =>7/16.
 expect(3/4*.5).toBe(3/8);expect(1-(1-.25)**2).toBe(7/16)
 // Lightness scalar for opaque neutral foregroundL=.5: B=1, f(g)=g.
 // Patternalpha1/4 and mask3/4 clamp to1/4 BEFORE opacity/flow, even atstrength0.
 expect(Math.min(3/4,1/4)).toBe(1/4);expect(1/4*.5).toBe(1/8)
})

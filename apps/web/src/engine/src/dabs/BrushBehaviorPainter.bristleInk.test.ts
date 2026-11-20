import {genuineBristle93Fixture} from '../../testing/bristle93Fixture'
import {MockGL} from '../../testing/mockGL'
import {installBrushPixels} from '../presets/importedBrushes'
import {prepareBristleSaturationLookup,acquireBristleSaturationLookup} from '../presets/bristleSaturationLookup'
import {BristleSaturationResource,bristleSaturationResourceKey,type PreparedBristleSaturationResource} from './BristleSaturationResource'
import {BrushTextureCache} from './BrushTextureCache'
import {webcrypto} from 'node:crypto'
import {afterEach,expect,it,vi} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {BrushContext} from './BrushPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from '../presets/pencilPresets'
import {DIGITAL_BRUSHES} from '../presets/digitalBrushPresets'
import {BristleRequestBatch} from './BristleRequestBatch'
import {createBristleInkProfile} from '../presets/brushBristleInk'
const ink={depletion:[0,.25,.5,1],useOpacity:true,useSaturation:false,useWeights:false,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50}
const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],version:72,model:'stamp',flow:1,flowPer:'stamp',paperInteraction:0,texture:undefined,wet:undefined,tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],bristle:{version:2,hairs:[[0,0,1],[.1,0,.5]],scale:1,shear:0,random:0,mousePressure:false,threshold:false,connected:true,antialias:false,compositing:false,ink},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}
function fixture(tiles=0,selectedBrush:BrushDescriptor=brush,glOverride?:WebGLRenderingContext,source?:(b:NonNullable<BrushDescriptor['bristle']>)=>PreparedBristleSaturationResource){
 const gl=glOverride??new Proxy({}, {get:(_t,key)=>{
  if(key==='getUniformLocation')return (_p:unknown,name:string)=>name
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true
  if(key==='getAttribLocation')return ()=>0
  if(key==='getExtension')return ()=>null
  if(String(key).startsWith('create'))return ()=>({})
  return ()=>{}
 }}) as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1} as unknown as BrushContext,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{},undefined,undefined,source)
 painter.initGL()
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}} as unknown as AccumulationBuffer)
 const original=buffer(),coverage=buffer(),ceiling=buffer()
 const scratch={getOrCreate:()=>({original,coverage}),brushCeiling:()=>ceiling,brushCeilingCopy:()=>ceiling,noteBrushEdgePx:()=>0} as unknown as BehaviorScratch
 const target={resolveForPaint:()=>Array.from({length:tiles},(_,i)=>({originX:i*64,originY:0,buffer:buffer(),contentRect:null})),markContentPainted:()=>{}}
 const dab=(x:number):Dab=>({x,y:20,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:x})
 const paint=(points:number[])=>painter.paint(target,points.map(dab),{sizeMultiplier:1}as PencilPreset,selectedBrush,{size:true,opacity:true},[1,0,0],scratch)
 return {painter,scratch,paint}
}
afterEach(()=>vi.restoreAllMocks())
function prepared(){
 vi.spyOn(BristleRequestBatch.prototype,'prepareInkProfile').mockImplementation(()=>{})
 vi.spyOn(BristleRequestBatch.prototype,'assertInkPrepared').mockImplementation(()=>{})
 vi.spyOn(BristleRequestBatch.prototype,'preparedInkProfile').mockReturnValue(createBristleInkProfile(ink))
 vi.spyOn(BristleRequestBatch.prototype,'prepareDimensions').mockImplementation(()=>{})
 return vi.spyOn(BristleRequestBatch.prototype,'paint').mockImplementation(()=>{})
}
it('advances each native trajectory outside visibility and preserves exact cloned continuation',()=>{
 prepared();const a=fixture();a.painter.prepareBristleInk(ink,false,false);a.paint([20,24,28])
 expect(a.scratch.brushBehavior?.bristle?.ink?.hairs.map(h=>h.counter)).toEqual([12,12])
 const b=fixture();b.painter.prepareBristleInk(ink,false,false);b.scratch.brushBehavior=structuredClone(a.scratch.brushBehavior)
 a.paint([32]);b.paint([32]);expect(b.scratch.brushBehavior).toEqual(a.scratch.brushBehavior)
})
it('captures spans once before two tile replays, with no hair-length multiplication twice',()=>{
 const draw=prepared(),a=fixture(2);a.painter.prepareBristleInk(ink,false,false);a.paint([20,24])
 expect(draw).toHaveBeenCalledTimes(2);expect(a.scratch.brushBehavior?.bristle?.ink?.hairs.map(h=>h.counter)).toEqual([6,6])
 const first=draw.mock.calls[0][0],second=draw.mock.calls[1][0]
 expect(first).toBe(second);expect(first.map(s=>s.flow)).toEqual([1,1]);expect(draw.mock.calls[0][5]).toEqual({antialias:false,compositing:false})
})
it('fails prewarm readiness before geometry/counters advance',()=>{
 const a=fixture();expect(()=>a.paint([20,24])).toThrow('not prepared');expect(a.scratch.brushBehavior).toBeUndefined()
})

it('consumes the genuine compiled93 binding once before tile replay and preserves cloned continuation',async()=>{
 vi.stubGlobal('crypto',webcrypto)
 const {bristle,raw,descriptor}=genuineBristle93Fixture()
 if(bristle.version!==2||!bristle.saturationLookup)throw Error('Expected Bristle2')
 installBrushPixels(bristle.saturationLookup.asset,raw);await prepareBristleSaturationLookup(bristle)
 const selected:BrushDescriptor={...brush,version:93,bristle:{...bristle,hairs:[[0,0,1],[.1,0,.5]],random:0,connected:true}}
 Object.freeze(selected.bristle);await prepareBristleSaturationLookup(selected.bristle!)
 const gl=new MockGL(),ctx=gl as unknown as WebGLRenderingContext,cache=new BrushTextureCache(ctx),owner=new BristleSaturationResource(ctx,cache)
 const key=bristleSaturationResourceKey(bristle);owner.prepare(selected.bristle!,[key])
 const binding=acquireBristleSaturationLookup(selected.bristle!),draw=prepared()
 vi.spyOn(BristleRequestBatch.prototype,'prepareCompiledSaturation').mockImplementation((_s,resource)=>{resource.assertCurrent();resource.release()})
 vi.spyOn(BristleRequestBatch.prototype,'preparedInkProfile').mockReturnValue(binding.profile)
 vi.spyOn(BristleRequestBatch.prototype,'preparedSaturationTable').mockReturnValue(binding.table)
 const a=fixture(2,selected,ctx,b=>owner.acquire(b));a.painter.prepareBristleInk(bristle.ink,false,false,selected.bristle);a.paint([20,24])
 expect(draw).toHaveBeenCalledTimes(2);expect(draw.mock.calls[0][0]).toBe(draw.mock.calls[1][0]);expect(a.scratch.brushBehavior?.bristle?.ink?.hairs.map(h=>h.counter)).toEqual([6,6])
 const b=fixture(2,selected,ctx,current=>owner.acquire(current));b.painter.prepareBristleInk(bristle.ink,false,false,selected.bristle);b.scratch.brushBehavior=structuredClone(a.scratch.brushBehavior)
 a.paint([28]);b.paint([28]);expect(b.scratch.brushBehavior).toEqual(a.scratch.brushBehavior)
 expect(descriptor.bristle?.saturationLookup?.asset).toBe(bristle.saturationLookup.asset)
 owner.reset();cache.clear();vi.unstubAllGlobals()
})

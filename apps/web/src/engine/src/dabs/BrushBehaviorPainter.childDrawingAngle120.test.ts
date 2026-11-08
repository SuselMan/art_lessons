import{it,expect}from'vitest'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import type{BrushContext}from'./BrushPainter'
import type{PencilPreset}from'../presets/pencilPresets'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{DIGITAL_BRUSHES}from'../presets/digitalBrushPresets'
const angle=.6435011087932844
function pair():BrushDescriptor{const part=():BrushDescriptor=>({...DIGITAL_BRUSHES[0],version:120,scatter:undefined,sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],tip:{kind:'bitmap',mask:`asset:${'a'.repeat(64)}`,hardness:1,aspect:2,angle:0,rotation:'path'},behavior:{version:2,rotation:{follow:1,random:'none'},strokeInput:{version:1,initialDirection:'cursorHistory'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}});const root=part();root.behavior!.dual={brush:part(),sampling:'independent',blendMode:'multiply'};return root}
const dab:Dab={x:20,y:20,size:4,pressure:1,opacity:1,angle:0,sourceAngle:angle,aspectRatio:1,tiltX:0,tiltY:0,t:0}
it('actual public paint rejects missing parent policy, old119 and inline BEFORE scratch or GL',()=>{
 for(const edit of[(b:BrushDescriptor)=>{delete b.behavior!.strokeInput},(b:BrushDescriptor)=>{b.version=119},(b:BrushDescriptor)=>{Reflect.set(b.behavior!.dual!,'sampling','inline')}]){const brush=pair();edit(brush);let allocations=0;const scratch={getOrCreate:()=>{allocations++;throw Error('must not allocate')},brushSecondary:()=>{allocations++;throw Error('must not allocate')}}as unknown as BehaviorScratch,painter=new BrushBehaviorPainter({}as BrushContext,()=>{throw Error('GL forbidden')},()=>{throw Error('GL forbidden')},()=>{throw Error('GL forbidden')},()=>{throw Error('GL forbidden')});expect(()=>painter.paint({resolveForPaint:()=>{throw Error('target forbidden')},markContentPainted:()=>{}},[dab],{}as PencilPreset,brush,{size:true,opacity:true},[1,0,0],scratch)).toThrow('matching120');expect(allocations).toBe(0);expect(scratch.brushBehavior).toBeUndefined()}
})
it('actual recursive child deposition consumes captured F64 direction and own child target footprint',()=>{
 const values=new Map<string,number[]>(),stop=Error('child deposition reached');let captured:Map<string,number[]>|undefined;const bounds:Array<{minX:number;minY:number;maxX:number;maxY:number}>=[];let childTiles=0
 const gl=new Proxy({}, {get:(_t,key)=>{if(key==='getUniformLocation')return(_p:unknown,n:string)=>n;if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;if(key==='getAttribLocation')return()=>0;if(key==='getExtension')return()=>null;if(String(key).startsWith('create'))return()=>({});if(String(key).startsWith('uniform'))return(n:string,...v:number[])=>values.set(n,v);if(key==='drawArrays')return()=>{if(values.has('u_angle')&&values.has('u_dabCenter')){captured=new Map(values);throw stop}};return()=>{}}})as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{});painter.initGL()
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer),rootBuffer=buffer(),childBuffer=buffer()
 const make=():BehaviorScratch=>({getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:()=>buffer(),brushCeilingCopy:()=>buffer(),noteBrushEdgePx:()=>0})as unknown as BehaviorScratch
 const childScratch=make(),scratch=make(),sampling={remaining:0};scratch.brushSecondary=()=>({scratch:childScratch,sampling,tile:()=>{childTiles++;return childBuffer}})
 const target={resolveForPaint:(b:{minX:number;minY:number;maxX:number;maxY:number})=>{bounds.push(b);return[{originX:0,originY:0,buffer:rootBuffer,contentRect:null}]},markContentPainted:()=>{}}
 expect(()=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,pair(),{size:true,opacity:true},[1,0,0],scratch)).toThrow(stop)
 expect(childTiles).toBe(1);expect(captured!.get('u_angle')).toEqual([angle]);expect(captured!.get('u_dabCenter')).toEqual([20,20]);expect(captured!.get('u_dabRadius')).toEqual([1]);expect(captured!.get('u_aspectRatio')).toEqual([2]);expect(bounds[0].minX).toBe(16);expect(bounds[0].maxX).toBe(24);expect(childScratch.brushBehavior?.firstAngle).toBe(angle)
 painter.destroy()
})

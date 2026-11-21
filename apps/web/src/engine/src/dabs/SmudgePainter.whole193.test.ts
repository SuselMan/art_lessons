import fs from 'node:fs'
import path from 'node:path'
import {expect,it,vi} from 'vitest'
import {BRUSH_BLEND_MODES,createBrushRandomStrokeId,createBrushSourceNonce,makeBrushGradient,type BrushLibrary,hasColorSmudge193Scope,type BrushDescriptor,type Dab} from '@grafetto/shared'
import {colorSmudge193CompositeCode,colorSmudge193Fragment} from '../raster/colorSmudge193Shader'
import {wetTransferFragment} from '../raster/wetMixShaders'
import {digitalBrushFromPreset} from '../presets/digitalBrushPresets'
import {brushPreparationPlan} from './BrushPreparation'
import {installBrushLibrary,installBrushPixels} from '../../brushLibrary'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady} from '../../testing/engineTestUtils'
import {mask190RootExecution} from '../presets/independentMask190'
import {assertBrushSourceInputs,brushExecutionContext} from '../presets/brushExecutionContext'
import {canvasMeanSourceRect} from '../raster/canvasMeanGeometry'
import {gihFrameMaskBounds} from '../raster/gihFrameGeometry'

let serial=0x193000
const alpha=`asset:${'d1'.repeat(32)}`as const,gray=`asset:${'d2'.repeat(32)}`as const,grain=`asset:${'d3'.repeat(32)}`as const,erased=`asset:${'d4'.repeat(32)}`as const,frame=`asset:${'d5'.repeat(32)}`as const
function brush(modern:boolean,mode='normal'):BrushDescriptor{
 const b=structuredClone(digitalBrushFromPreset('hard-round'))
 b.id='imported-'+(++serial).toString(16).padStart(24,'0');b.version=193;b.model='mixer';b.paperInteraction=0
 b.flow=1;b.flowPer='stamp';b.flowByPressure=[[0,1],[1,1]];b.opacityByPressure=[[0,1],[1,1]];b.sizeByPressure=[[0,1],[1,1]]
 b.tip={kind:'procedural',hardness:1,aspect:1.3,angle:.2,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:.6,verticalFade:.8,antialias:true}}
 b.behavior={version:2,rendering:{mode:'buildUp',accumulation:'directOver',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'},...(mode==='erase'?{erase:true}:{})}
 b.mixer={load:0,initialLoad:0,pickup:.7,strength:1,source:'previousCanvas',smearAlpha:true,foreground:{rate:.6},...(modern?{algorithm:'krita-mask'}:{}),colorRateComposite:mode as NonNullable<BrushDescriptor['mixer']>['colorRateComposite']}
 return b
}
function install(b:BrushDescriptor){
 const assets=[alpha,gray,grain,erased,frame].map(id=>({id,size:8,file:id.slice(6)+'.bin'}))
 installBrushLibrary({schemaVersion:1,brushes:[{name:'Whole193',source:'qa',warnings:[],descriptor:b}],assets,skipped:[]})
 for(const id of[alpha,frame])installBrushPixels(id,new Uint8Array(64).fill(255))
 installBrushPixels(gray,new Uint8Array(64).fill(160));installBrushPixels(grain,new Uint8Array(64).fill(72));installBrushPixels(erased,new Uint8Array(64).fill(198))
 return `brush:${b.id}@193`
}
const input=()=>[20.25,30.75,41.25,52.75].map((x,i)=>dab(x,30.25,{size:8,sourceSize:8,sourceScale:1,sourceAngle:.4,sourceTwist:180,sourceTangentialPressure:.5,t:i}))
it('uses one full foreground bank for both native strategies; historical inputs retain their factory',()=>{
 const old=wetTransferFragment(true,true,true,true)
 for(const modern of[false,true]){
  const shader=colorSmudge193Fragment(modern)
  expect(shader).toContain('colorSmudge193Paint');expect(shader).toContain('brushKritaHardMix')
  expect(shader).toContain('u_colorSmudgeComposite>32.5');expect(shader).toContain('u_colorSmudgeComposite>30.5');expect(shader).toContain('brushEffectsMask')
  expect(shader).toContain('brushAutoMaskNoiseU8');expect(shader).toContain('brushGihFrameSample')
  if(modern)expect(shader).toContain('u_colorSmudgeComposite<0.5')
 }
 expect(wetTransferFragment(true,true,true,true)).toBe(old)
 const codes=[...BRUSH_BLEND_MODES,'grainMerge','grainExtract','negation','erase','parallel','behind'].map(colorSmudge193CompositeCode)
 expect(codes).toEqual(Array.from({length:34},(_,i)=>i))
 expect(colorSmudge193CompositeCode('dodge')).toBe(colorSmudge193CompositeCode('colorDodge'))
 expect(()=>colorSmudge193CompositeCode('invented')).toThrow('Unknown')
})
it.each([false,true])('cold recorded193 (modern%s) prewarms before target writes; all foreground modes reuse it warm',async modern=>{
 const b=brush(modern,'overlay'),preset=install(b),{engine}=createTestEngine({}, {width:96,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const gl=engine['gl'],compile=vi.spyOn(gl,'createProgram'),upload=vi.spyOn(gl,'texImage2D')
  const p=engine['_smudge'],paint=vi.spyOn(p,'paint'),draw=vi.spyOn(p as unknown as{drawTransferDab:(...a:unknown[])=>void},'drawTransferDab')
  engine.appendOperation(makeStroke('peer','ink',input(),{tool:'digitalBrush',preset,strokeId:'whole193',strokeEnd:true}),'remote')
  expect(paint).toHaveBeenCalled();expect(draw.mock.calls.filter(c=>c[7]==='lay')).toHaveLength(3)
  const warm={programs:compile.mock.calls.length,uploads:upload.mock.calls.length}
  expect(warm.programs).toBeGreaterThan(0)
  engine.appendOperation(makeStroke('peer','ink',input().map(d=>({...d,y:d.y+15})),{tool:'digitalBrush',preset,strokeId:'whole193-warm',strokeEnd:true}),'remote')
  expect(compile).toHaveBeenCalledTimes(warm.programs);expect(upload).toHaveBeenCalledTimes(warm.uploads)
  const binding=(Reflect.get(p,'texture191Transfers')as Map<string,{program:{uniforms:Map<string,unknown>}}>).get(modern?'193:modern':'193:legacy')!
  expect(binding.program.uniforms.get('u_colorSmudgeComposite')).toBe(BRUSH_BLEND_MODES.indexOf('overlay'))
 }finally{engine.destroy()}
})
it.each([[false,false],[true,false],[false,true],[true,true]]as const)('unequal multidimensional GIH193 preserves geometry and source rect across chunks: modern%s dulling%s',async(modern,dulling)=>{
 const run=async(chunked:boolean)=>{
  const b=brush(modern,'softLight')
  if(dulling)b.mixer!.sampling={mode:modern?'maskMean':'adaptiveMean',radius:1}
  const rows=[{sourceWidth:3,sourceHeight:5,maskBounds:gihFrameMaskBounds({width:3,height:5},8)},{sourceWidth:5,sourceHeight:2,maskBounds:gihFrameMaskBounds({width:5,height:2},8)}]
  b.tip={kind:'bitmap',mask:alpha,hardness:1,aspect:1.3,angle:.43,rotation:'fixed',maskBounds:rows[0].maskBounds,animation:{mode:'dimensions',frames:[alpha,frame],dimensions:[{mode:'constant',rank:2},{mode:'incremental',rank:2}],geometry:{version:1,frames:rows}}}
  const preset=install(b),{engine}=createTestEngine({}, {width:96,height:64})
  try{
   await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
   const painter=engine['_smudge'] as unknown as{drawTransferDab:(...a:unknown[])=>void;paintBehaviorDab:(...a:unknown[])=>void;meanPreviousCanvas:(...a:unknown[])=>unknown}
   const draw=vi.spyOn(painter,'drawTransferDab'),mean=vi.spyOn(painter,'meanPreviousCanvas')
   const predecessor:Array<{x:number;y:number}>=[],original=painter.paintBehaviorDab
   vi.spyOn(painter,'paintBehaviorDab').mockImplementation(function(...args){const state=(Reflect.get(painter,'wetGestures')as Map<string,{previousMeanPlaced?:{x:number;y:number}}>).get('peer');if(state?.previousMeanPlaced)predecessor.push({...state.previousMeanPlaced});return original.apply(painter,args)})
   const append=(d:Dab[],end:boolean)=>engine.appendOperation(makeStroke('peer','ink',d,{tool:'digitalBrush',preset,strokeId:'gih193',...(end?{strokeEnd:true}:{})}),'remote')
   if(chunked){append(input().slice(0,2),false);append(input().slice(2),true)}else append(input(),true)
   const contacts=draw.mock.calls.filter(c=>c[7]==='lay').map(c=>{const w=c[9]as{gih:{x:number;y:number;width:number;height:number;frame:readonly number[]};meanRect:{minX:number;minY:number;maxX:number;maxY:number};stamp:{frameIndex:number}};return{dab:c[1],frame:w.stamp.frameIndex,gih:w.gih,rect:w.meanRect}})
   if(dulling){expect(mean).toHaveBeenCalledTimes(3);for(const[i,c]of contacts.entries()){expect(c.rect).toEqual({minX:c.gih.x,minY:c.gih.y,maxX:c.gih.x+c.gih.width,maxY:c.gih.y+c.gih.height});expect(mean.mock.calls[i][1]).toEqual(canvasMeanSourceRect(predecessor[i],c.rect,1))}}
   return contacts
  }finally{engine.destroy()}
 }
 const full=await run(false);expect(full).toHaveLength(3);expect(full.map(c=>c.frame)).toEqual([1,0,1]);expect(full[0].gih.width).toBeGreaterThan(full[0].gih.height)
 expect(await run(true)).toEqual(full)
})
it('Lightness193 erase retains the colour/height stage and binds the captured erase texture pair',async()=>{
 const b=brush(true,'erase');b.tip={kind:'bitmap',mask:alpha,hardness:1,aspect:1,angle:0,rotation:'fixed',material:{kind:'lightness',gray,strength:1}}
 b.mixer!.paintThickness={value:.6,mode:'overwrite'}
 b.texture={id:grain,eraseId:erased,strength:.8,periodPx:8,patternSize:{width:8,height:8},application:{mode:'height',soft:false}}
 expect(hasColorSmudge193Scope(b)).toBe(true);expect(brushPreparationPlan(b).resources.some(r=>r.id===erased)).toBe(true)
 const preset=install(b),{engine}=createTestEngine({}, {width:96,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const p=engine['_smudge'],draw=vi.spyOn(p as unknown as{drawTransferDab:(...a:unknown[])=>void},'drawTransferDab'),lookup=vi.spyOn(p as unknown as{wetTexture:(...a:unknown[])=>unknown},'wetTexture')
  engine.appendOperation(makeStroke('peer','ink',input(),{tool:'digitalBrush',preset,strokeId:'height193',strokeEnd:true}),'remote')
  expect(draw.mock.calls.filter(c=>c[7]==='height')).toHaveLength(3)
  expect(lookup.mock.calls.some(c=>c[0]===erased&&c[1]===true)).toBe(true)
  expect(lookup.mock.calls.some(c=>c[0]===grain)).toBe(false)
 }finally{engine.destroy()}
})

const nativeLibrary=process.env.NATIVE193_LIBRARY
it.skipIf(!nativeLibrary)('genuine native193 complete corpus: public cold-peer first contact skips, next contacts paint with exact descriptors and captured source',async()=>{
 const library=JSON.parse(fs.readFileSync(nativeLibrary!,'utf8')) as BrushLibrary
 expect(library.brushes).toHaveLength(42)
 installBrushLibrary(library)
 for(const asset of library.assets)installBrushPixels(asset.id,new Uint8Array(fs.readFileSync(path.join(path.dirname(nativeLibrary!),asset.file))))
 const {engine}=createTestEngine({}, {width:128,height:80})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','native193'))
  const draw=vi.spyOn(engine['_smudge']as unknown as{drawTransferDab:(...a:unknown[])=>void},'drawTransferDab')
  for(const imported of library.brushes){
   const b=imported.descriptor,seeds={version:1 as const,sequentialSeed:0,strokeSeed:0xffffffff}
   const source={version:1 as const,gradient:makeBrushGradient([.7,.2,.4,.8],[.1,.8,.3,.4]),...(b.mixer!.source==='projectionCanvas'?{projection:[{id:'native193',opacity:1}]}:{})}
   const strokeId=createBrushRandomStrokeId(createBrushSourceNonce(b.id.slice(9),source),seeds)
   const points=input().map(p=>({...p,sourceSize:16,size:16,sourceScale:Math.fround(.8),normalizedSpeed:Math.fround(.4),sourceTime:p.t*17,tiltX:25,tiltY:-15}))
   const packet=(d:Dab[],packetSeq:number)=>engine.appendPeerLiveDabs('peer',{tool:'digitalBrush',layerId:'native193',color:[.7,.2,.4],preset:`brush:${b.id}@193`,strokeId,brushRandom:seeds,brushSource:source,packetSeq,dabs:d})
   draw.mockClear();packet(points.slice(0,1),0);expect(draw,imported.name+' first contact').not.toHaveBeenCalled()
   packet(points.slice(1),1)
   expect(draw.mock.calls.filter(c=>c[7]==='lay').length,imported.name+' actual transfer').toBeGreaterThan(0)
   expect(draw.mock.calls.some(c=>c[7]==='height'),imported.name+' Lightness height').toBe(!!b.mixer!.paintThickness)
   expect([...engine['_peerLiveStrokes'].values()].at(-1),imported.name+' packet acceptance').toMatchObject({paintedTotal:4,liveOffset:4,desynced:false})
   engine.appendOperation(makeStroke('peer','native193',points,{tool:'digitalBrush',preset:`brush:${b.id}@193`,strokeId,brushRandom:seeds,brushSource:source,strokeEnd:true}),'remote')
  }
 }finally{engine.destroy()}
})

it('whole193 mixer-side speed sensors latch the same mandatory carrier, before paint',()=>{
 const b=brush(true);b.behavior!.speedInput={version:1,space:'view',maximum:30,estimator:'grafettoEMA30ms'}
 b.mixer!.pickupDynamics=[{control:'speed',minimum:0,jitter:0,curve:[[0,0],[1,1]]}]
 const execution=mask190RootExecution(b,brushExecutionContext({version:1,sequentialSeed:0,strokeSeed:0xffffffff}))
 expect(execution!.maskRole190!.needSpeed).toBe(true)
 expect(()=>assertBrushSourceInputs(b,input(),undefined,execution)).toThrow('canonical captured')
 expect(()=>assertBrushSourceInputs(b,input().map(d=>({...d,normalizedSpeed:Math.fround(.4)})),undefined,execution)).not.toThrow()
 expect(()=>mask190RootExecution(b,{...execution,maskRole190:{...execution!.maskRole190!,role:'child',childId:b.id}})).toThrow('root-only')
})
it.each(['MASK','RGB','Gradient','Lightness']as const)('static original3x7 %s uses the same native geometry without synthetic animation, cold peer through actual engine',async kind=>{
 const b=brush(kind!=='MASK');b.tip={kind:'bitmap',mask:alpha,hardness:1,aspect:1,angle:0,rotation:'fixed',maskBounds:gihFrameMaskBounds({width:3,height:7},8),sourceGeometry:{version:1,width:3,height:7}}
 if(kind==='RGB'){b.tip.color={planes:[gray,gray,gray]};b.mixer!.algorithm='krita-stamp'}
 if(kind==='Gradient'){b.tip.color={gradient:{gray}};b.mixer!.algorithm='krita-stamp'}
 if(kind==='Lightness'){b.tip.material={kind:'lightness',gray,strength:1};b.mixer!.paintThickness={value:.6,mode:'overlay'}}
 const preset=install(b),{engine}=createTestEngine({}, {width:96,height:64}),seeds={version:1 as const,sequentialSeed:0xffffffff,strokeSeed:0},source={version:1 as const,gradient:makeBrushGradient([1,0,0,1],[0,0,1,.5])},strokeId=createBrushRandomStrokeId(createBrushSourceNonce('static193qa'+kind,source),seeds)
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const painter=engine['_smudge'],draw=vi.spyOn(painter as unknown as{drawTransferDab:(...a:unknown[])=>void},'drawTransferDab'),upload=vi.spyOn(engine['gl'],'texImage2D')
  const append=(d:Dab[],end:boolean)=>engine.appendOperation(makeStroke('peer','ink',d,{tool:'digitalBrush',preset,strokeId,brushRandom:seeds,brushSource:source,...(end?{strokeEnd:true}:{})}),'remote')
  append(input().slice(0,1),false);expect(draw).not.toHaveBeenCalled();const casUploads=()=>upload.mock.calls.filter(call=>call.at(-1) instanceof Uint8Array).length,warmed=casUploads()
  append(input().slice(1),true);expect(casUploads()).toBe(warmed)
  const contacts=draw.mock.calls.filter(c=>c[7]==='lay')
  expect(contacts).toHaveLength(3)
  for(const c of contacts){const w=c[9]as{gih:{width:number;height:number;frame:readonly number[]};stamp:{frameIndex?:number}};expect(w.gih.frame).toEqual([1,3,7,7]);expect(w.gih.width).toBe(4);expect(w.gih.height).toBe(8);expect(w.stamp.frameIndex).toBeUndefined()}
  expect(b.tip.animation).toBeUndefined()
 }finally{engine.destroy()}
})

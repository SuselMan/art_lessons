import { describe,it,expect,vi } from 'vitest'
import {RibbonStrokePainter as OwnerRibbonStrokePainter} from '../../../../temp/owner-fifo-runtime/OwnerRibbonStrokePainter'
import {createPreparedGlSourcePort} from './PreparedGlSourceDraw'
import type {RibbonPasses,RibbonPassesContext} from '../../../../apps/web/src/engine/src/raster/RibbonPasses'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from '../../../../apps/web/src/engine/testing/engineTestUtils'
import { RibbonStrokeScratch } from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../../../../apps/web/src/engine/src/buffers/RibbonScratchPool'
import type { ILayerBuffer } from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
import type { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type { PencilPreset } from '../../../../apps/web/src/engine/src/presets/pencilPresets'
import type { RibbonStrokePainter,RibbonStrokePainterContext } from '../../../../apps/web/src/engine/src/dabs/RibbonStrokePainter'
import { ribbonProfileFor,type RibbonProfile } from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import { ribbonWaterDelivery } from '../../../../apps/web/src/engine/src/dabs/ribbonStrokeMath'
import { createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk,type CanonicalDrawCommand,type CanonicalDrawPhase,type CanonicalPreparedUniforms } from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'

type Probe={_ribbonPainter:RibbonStrokePainter;_ribbonScratchPool:RibbonScratchPool;_layers:Map<string,ILayerBuffer>;_resolvePreset(t:string,p:string):PencilPreset}
describe('actual production CPU source to prepared GL ordered API corpus',()=>{
 it.each(['round','chisel'].flatMap(nib=>[false,true].flatMap(segmented=>[false,true].flatMap(film=>[1,4].map(count=>({nib,segmented,film,count}))))))('production exact commands $nib segment=$segmented film=$film count=$count',({nib,segmented,film,count})=>{
  const {engine}=createTestEngine({paper:'flat',pageWidth:1024,pageHeight:1024},{width:64,height:64});engine.initLayer('L');const probe=engine as unknown as Probe,painter=probe._ribbonPainter,ctx=(painter as unknown as {ctx:RibbonStrokePainterContext}).ctx;
  painter.diagnosticSegmentDelivery=segmented?'combined':false;painter.diagnosticForeignSolvent=false;painter.diagnosticSolventField=segmented;painter.diagnosticPigmentRecord=true;
  const minmax=vi.spyOn(ctx,'minmaxExt').mockReturnValue(film?{MAX_EXT:0x8008}:null);
  const scratch=new RibbonStrokeScratch(probe._ribbonScratchPool,true,true),commands:CanonicalDrawCommand[]=[],captures:{kind:'stamp'|'ribbon';args:unknown[]}[]=[];
  const phaseOf=(dest:AccumulationBuffer,tile:Parameters<RibbonStrokePainterContext['drawRibbonNibPass']>[1],p?:RibbonProfile):CanonicalDrawPhase=>{const entry=scratch.peek(tile.buffer)!;if(dest===entry.coverage)return 'coverage';if(dest===entry.strokeSolvent)return 'solvent';if(dest===entry.strokeColor||dest===entry.inkColor)return 'color';return p?.inkEdgeFalloff===1?'halo':'pigment'};
  const uniforms=(p:RibbonProfile,tile:{originX:number;originY:number},seed:readonly[number,number],depth:readonly[number,number,number]|null,combs:number,hairs:number,pool:number,available:boolean,water:number,retain:number):CanonicalPreparedUniforms=>({aaPx:p.aaPx,washWater:water,waterRetain:retain,bristleCombs:combs,bristleInk:hairs,tau:depth??[0,0,0],worldOrigin:[tile.originX,-tile.originY||0],mottleSeed:seed,cloudDeposit:p.cloud,granDeposit:p.granulation,poolBlot:pool,useAvailableWater:available});
  const nibSpy=vi.spyOn(ctx,'drawRibbonNibPass').mockImplementation((dest,tile,dab,preset,p,mode,opacity,_own,water=0,across=[0,1],wet=0,strength=1,seed=[0,0],clip=null,combs=0,hairs=0,depth=null,puddle=1,pool=0)=>{
   captures.push({kind:'stamp',args:[dest,tile,dab,preset,p,mode,opacity,_own,water,across,wet,strength,seed,clip,combs,hairs,depth,puddle,pool]});const radius=dab.size*.5*preset.sizeMultiplier,delivery=ribbonWaterDelivery(p);commands.push({kind:'stamp',phase:phaseOf(dest,tile,p),inkMode:mode===6?6:7,stamp:{center:[dab.x-tile.originX,dab.y-tile.originY],radius,aspect:dab.aspectRatio,angle:dab.angle,pressure:dab.pressure,opacity,nibShape:p.nibShape,cornerRadius:radius*p.cornerFraction,inkEdge:p.inkEdgeFalloff,inkWater:water,paperWet:wet,inkStrength:strength,puddle,pigmentPool:puddle,acrossLocal:across,inkClip:clip?p.diagnosticReadFluid?2:1:0,inkBlend:film?'max':'add',uniforms:uniforms(p,tile,seed,depth,combs,hairs,pool,!!clip&&!!p.diagnosticReadFluid,delivery.water,delivery.retain)}})
  });
  const bandSpy=vi.spyOn(ctx,'drawRibbonBands').mockImplementation((dest,tile,vertices,mode,aa,cloud=0,gran=0,seed=[0,0],water=0,retain=0,combs=0,hairs=0,depth=null,pool=0,available=null)=>{if(!vertices.length)return;captures.push({kind:'ribbon',args:[dest,tile,vertices,mode,aa,cloud,gran,seed,water,retain,combs,hairs,depth,pool,available]});commands.push({kind:'ribbon',phase:mode==='coverage'?'coverage':phaseOf(dest,tile),batch:{vertices:vertices.slice(),inkBlend:film?'max':'add',uniforms:{aaPx:aa,washWater:water,waterRetain:retain,bristleCombs:combs,bristleInk:hairs,tau:depth??[0,0,0],worldOrigin:[tile.originX,-tile.originY||0],mottleSeed:seed,cloudDeposit:cloud,granDeposit:gran,poolBlot:pool,useAvailableWater:!!available}}})});
  const name=`normal:100:100:PB29:${nib}`,preset=probe._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name,0),dabs:Dab[]=Array.from({length:count},(_,i)=>({x:15+i*10,y:i===2?35:25,size:12-i,pressure:i===count-1?.03:.8,aspectRatio:nib==='chisel'?2:1,angle:.7,opacity:1,tiltX:0,tiltY:0,t:Math.floor(i/2)*40}));
  try{
   for(const _ of painter.paint(probe._layers.get('L')!,dabs,preset,name,profile,[.2,.1,.5],scratch,undefined,'0f37'.slice(0,count),[1,2]))void _;
   const native=prepareCanonicalStrokeChunk(createCanonicalStrokeChunkState(),{dabs,preset,presetName:name,profile,color:[.2,.1,.5],wetProfile:'0f37'.slice(0,count),strokeSeed:[1,2],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film,segmentMode:segmented?'combined':false,options:{diagnosticWaterPolicy:painter.diagnosticWaterPolicy,diagnosticSharedFluid:painter.diagnosticSharedFluid,diagnosticLandingReservoir:painter.diagnosticLandingReservoir,diagnosticLandingPolicy:painter.diagnosticLandingPolicy,diagnosticCanonicalSettleRadius:painter.diagnosticCanonicalSettleRadius,diagnosticSolventField:segmented,diagnosticPigmentRecord:true}});
   expect(native.commands).toEqual(commands);
   const generated=new OwnerRibbonStrokePainter(ctx);for(const key of Object.keys(painter))if(typeof (painter as any)[key]==='boolean'||typeof(painter as any)[key]==='string')(generated as any)[key]=(painter as any)[key]
   const ownScratch=new RibbonStrokeScratch(probe._ribbonScratchPool,true,true),requests:any[]=[]
   const beforeCommands=commands.length,resolve=vi.spyOn(ctx,'resolveWithinSheet')
   try{
    for(const _ of generated.paint(probe._layers.get('L')!,dabs,preset,name,profile,[.2,.1,.5],ownScratch,undefined,'0f37'.slice(0,count),[1,2],true,0,{waterOnly:false,segmented:false,deferMaterial:request=>requests.push(request)}))void _
    expect(requests.flatMap(request=>request.typedSource.commands)).toEqual(native.commands)
    expect(commands.length).toBe(beforeCommands);expect(resolve).not.toHaveBeenCalled()
    for(const request of requests)request.cancel(false)
   }finally{resolve.mockRestore();ownScratch.destroy()}

   expect(captures.length).toBe(native.commands.length)
   const ribbon=(engine as unknown as {_ribbonPasses:RibbonPasses})._ribbonPasses,rctx=(ribbon as unknown as {ctx:RibbonPassesContext}).ctx,gl=(engine as unknown as {gl:WebGLRenderingContext}).gl
   let calls:unknown[][]=[]
   const traceSpies=['useProgram','activeTexture','bindTexture','uniform1i','uniform1f','uniform2f','uniform3fv','bindBuffer','enableVertexAttribArray','vertexAttribPointer','bufferData','drawArrays','bindFramebuffer','viewport','enable','disable','blendEquation','blendFunc','blendFuncSeparate'].map(name=>vi.spyOn(gl as any,name).mockImplementation((...args:unknown[])=>{calls.push([name,...args.map(value=>value instanceof Float32Array?{F32:[...new Uint32Array(value.buffer,value.byteOffset,value.length)]}:Array.isArray(value)?[...value]:value)])}))
   const extSpy=vi.spyOn(rctx,'minmaxExt').mockReturnValue(film?{MAX_EXT:0x8008}:null)
   try {for(let i=0;i<captures.length;i++){
    const capture=captures[i],command=native.commands[i],dest=capture.args[0] as AccumulationBuffer,tile=capture.args[1] as Parameters<RibbonPasses['drawRibbonNibPass']>[1]
    calls=[]
    if(capture.kind==='stamp'){
     if(command.phase!=='coverage'){if(film)dest.beginMaxDraw({MAX_EXT:0x8008});else dest.beginAdditiveDraw()}
     ribbon.drawRibbonNibPass(...capture.args as Parameters<RibbonPasses['drawRibbonNibPass']>)
     if(command.phase!=='coverage')dest.endDraw()
    }else ribbon.drawRibbonBands(...capture.args as Parameters<RibbonPasses['drawRibbonBands']>)
    const original=calls;calls=[]
    const port=createPreparedGlSourcePort({bindCurrentCanonical:()=>{throw Error('Draw corpus must not acquire a stale base')},tile,context:rctx,ribbon,watercolor:{} as never,presetHardness:preset.hardness})
    port.draw(command,dest,scratch.peek(tile.buffer)!.coverage,command.phase==='coverage'?'over':film?'max':'add')
    expect(calls,`command ${i} ${command.kind}/${command.phase}`).toEqual(original)
   }}finally{for(const spy of traceSpies)spy.mockRestore();extSpy.mockRestore()}
   if(count===1){expect(native.commands.some(c=>c.kind==='ribbon')).toBe(false);expect(native.commands.filter(c=>c.phase==='pigment'&&c.kind==='stamp')).toHaveLength(1)}
   expect(native.commands.filter(c=>c.kind==='stamp').every(c=>c.stamp.pressure===dabs.find(d=>d.x===c.stamp.center[0])?.pressure)).toBe(true);
  }finally{nibSpy.mockRestore();bandSpy.mockRestore();minmax.mockRestore();scratch.destroy();engine.destroy()}
 });
});

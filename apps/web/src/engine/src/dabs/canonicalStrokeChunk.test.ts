import { describe,it,expect,vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync,writeFileSync,existsSync } from 'node:fs'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { PencilPreset } from '../presets/pencilPresets'
import type { RibbonStrokePainter,RibbonStrokePainterContext } from './RibbonStrokePainter'
import { ribbonProfileFor,type RibbonProfile } from './ribbonProfile'
import { ribbonWaterDelivery } from './ribbonStrokeMath'
import { createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk,type CanonicalDrawCommand,type CanonicalDrawPhase,type CanonicalPreparedUniforms } from './canonicalStrokeChunk'

type Probe={_ribbonPainter:RibbonStrokePainter;_ribbonScratchPool:RibbonScratchPool;_layers:Map<string,ILayerBuffer>;_resolvePreset(t:string,p:string):PencilPreset}
const goldenPath=new URL('./canonicalStrokeChunk.golden.json',import.meta.url),golden:Record<string,string>=existsSync(goldenPath)?JSON.parse(readFileSync(goldenPath,'utf8')):{}
const hash=(commands:CanonicalDrawCommand[])=>createHash('sha256').update(JSON.stringify(commands,(_key,value)=>value instanceof Float32Array?[...new Uint32Array(value.buffer,value.byteOffset,value.length)]:value)).digest('hex')
describe('canonical CPU source draw commands',()=>{
 it.each(['round','chisel'].flatMap(nib=>[false,true].flatMap(segmented=>[false,true].flatMap(film=>[1,4].map(count=>({nib,segmented,film,count,size:12,wet:'0f37'}))))).concat(['round','chisel'].flatMap(nib=>['0000','ffff'].map(wet=>({nib,segmented:true,film:true,count:4,size:400,wet})))))('production exact commands $nib segment=$segmented film=$film count=$count',({nib,segmented,film,count,size,wet})=>{
  const {engine}=createTestEngine({paper:'flat'},{width:64,height:64});engine.initLayer('L');const probe=engine as unknown as Probe,painter=probe._ribbonPainter,ctx=(painter as unknown as {ctx:RibbonStrokePainterContext}).ctx;
  painter.diagnosticSegmentDelivery=segmented?'combined':false;painter.diagnosticForeignSolvent=false;painter.diagnosticSolventField=segmented;painter.diagnosticPigmentRecord=true;
  const minmax=vi.spyOn(ctx,'minmaxExt').mockReturnValue(film?{MAX_EXT:0x8008}:null);
  const scratch=new RibbonStrokeScratch(probe._ribbonScratchPool,true,true),commands:CanonicalDrawCommand[]=[];
  const phaseOf=(dest:AccumulationBuffer,tile:Parameters<RibbonStrokePainterContext['drawRibbonNibPass']>[1],p?:RibbonProfile):CanonicalDrawPhase=>{const entry=scratch.peek(tile.buffer)!;if(dest===entry.coverage)return 'coverage';if(dest===entry.strokeSolvent)return 'solvent';if(dest===entry.strokeColor||dest===entry.inkColor)return 'color';return p?.inkEdgeFalloff===1?'halo':'pigment'};
  const uniforms=(p:RibbonProfile,tile:{originX:number;originY:number},seed:readonly[number,number],depth:readonly[number,number,number]|null,combs:number,hairs:number,pool:number,available:boolean,water:number,retain:number):CanonicalPreparedUniforms=>({aaPx:p.aaPx,washWater:water,waterRetain:retain,bristleCombs:combs,bristleInk:hairs,tau:depth??[0,0,0],worldOrigin:[tile.originX,-tile.originY||0],mottleSeed:seed,cloudDeposit:p.cloud,granDeposit:p.granulation,poolBlot:pool,useAvailableWater:available});
  const nibSpy=vi.spyOn(ctx,'drawRibbonNibPass').mockImplementation((dest,tile,dab,preset,p,mode,opacity,_own,water=0,across=[0,1],wet=0,strength=1,seed=[0,0],clip=null,combs=0,hairs=0,depth=null,puddle=1,pool=0)=>{
   const radius=dab.size*.5*preset.sizeMultiplier,delivery=ribbonWaterDelivery(p);commands.push({kind:'stamp',phase:phaseOf(dest,tile,p),inkMode:mode===6?6:7,stamp:{center:[dab.x-tile.originX,dab.y-tile.originY],radius,aspect:dab.aspectRatio,angle:dab.angle,pressure:dab.pressure,opacity,nibShape:p.nibShape,cornerRadius:radius*p.cornerFraction,inkEdge:p.inkEdgeFalloff,inkWater:water,paperWet:wet,inkStrength:strength,puddle,pigmentPool:puddle,acrossLocal:across,inkClip:clip?p.diagnosticReadFluid?2:1:0,inkBlend:film?'max':'add',uniforms:uniforms(p,tile,seed,depth,combs,hairs,pool,!!clip&&!!p.diagnosticReadFluid,delivery.water,delivery.retain)}})
  });
  const bandSpy=vi.spyOn(ctx,'drawRibbonBands').mockImplementation((dest,tile,vertices,mode,aa,cloud=0,gran=0,seed=[0,0],water=0,retain=0,combs=0,hairs=0,depth=null,pool=0,available=null)=>{if(!vertices.length)return;commands.push({kind:'ribbon',phase:mode==='coverage'?'coverage':phaseOf(dest,tile),batch:{vertices:vertices.slice(),inkBlend:film?'max':'add',uniforms:{aaPx:aa,washWater:water,waterRetain:retain,bristleCombs:combs,bristleInk:hairs,tau:depth??[0,0,0],worldOrigin:[tile.originX,-tile.originY||0],mottleSeed:seed,cloudDeposit:cloud,granDeposit:gran,poolBlot:pool,useAvailableWater:!!available}}})});
  const name=`normal:100:100:PB29:${nib}`,preset=probe._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name,0),dabs:Dab[]=Array.from({length:count},(_,i)=>({x:15+i*10,y:i===2?35:25,size:size-i,pressure:i===count-1?.03:.8,aspectRatio:nib==='chisel'?2:1,angle:.7,opacity:1,tiltX:0,tiltY:0,t:Math.floor(i/2)*40}));
  try{
   for(const _ of painter.paint(probe._layers.get('L')!,dabs,preset,name,profile,[.2,.1,.5],scratch,undefined,wet.slice(0,count),[1,2]))void _;
   const native=prepareCanonicalStrokeChunk(createCanonicalStrokeChunkState(),{dabs,preset,presetName:name,profile,color:[.2,.1,.5],wetProfile:wet.slice(0,count),strokeSeed:[1,2],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film,segmentMode:segmented?'combined':false,options:{diagnosticWaterPolicy:painter.diagnosticWaterPolicy,diagnosticSharedFluid:painter.diagnosticSharedFluid,diagnosticLandingReservoir:painter.diagnosticLandingReservoir,diagnosticLandingPolicy:painter.diagnosticLandingPolicy,diagnosticCanonicalSettleRadius:painter.diagnosticCanonicalSettleRadius,diagnosticSolventField:segmented,diagnosticPigmentRecord:true}});
   expect(native.commands).toEqual(commands);
   const key=`${nib}-${segmented}-${film}-${count}${size===12?'':'-400-'+wet}`,digest=hash(commands);if(process.env.WC_GENERATE_GOLDEN==='1'){golden[key]=digest;writeFileSync(goldenPath,JSON.stringify(golden,null,2)+'\n')}else expect(digest).toBe(golden[key]);
   if(count===1){expect(native.commands.some(c=>c.kind==='ribbon')).toBe(false);expect(native.commands.filter(c=>c.phase==='pigment'&&c.kind==='stamp')).toHaveLength(1)}
   expect(native.commands.filter(c=>c.kind==='stamp').every(c=>c.stamp.pressure===dabs.find(d=>d.x===c.stamp.center[0])?.pressure)).toBe(true);
  }finally{nibSpy.mockRestore();bandSpy.mockRestore();minmax.mockRestore();scratch.destroy();engine.destroy()}
 });
});

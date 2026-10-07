import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { PencilPreset } from '../presets/pencilPresets'
import { ribbonProfileFor, type RibbonProfile } from './ribbonProfile'
import type { RibbonStrokePainter, RibbonStrokePainterContext } from './RibbonStrokePainter'
import { prepareCanonicalRibbonBands } from './canonicalRibbonBands'

type Delivery = { waterByDab: Map<Dab,number>;pigmentByDab:Map<Dab,number>;excessByDab:Map<Dab,number>;paperWetByDab:Map<Dab,number>;puddleByDab:Map<Dab,number>;pigmentPoolByDab:Map<Dab,number> }
type DeliveryArgs = [Dab[],Dab|undefined,PencilPreset,RibbonProfile,RibbonStrokeScratch,(d:Dab)=>number,number,false|'combined'|'explicit',boolean,boolean]
type Probe = {_ribbonPainter:RibbonStrokePainter;_ribbonScratchPool:RibbonScratchPool;_layers:Map<string,ILayerBuffer>;_resolvePreset(t:string,p:string):PencilPreset}
const goldenPath = new URL('./canonicalRibbonBands.golden.json', import.meta.url)
const golden: Record<string,string> = existsSync(goldenPath) ? JSON.parse(readFileSync(goldenPath,'utf8')) : {}
describe('pure canonical preparation versus unchanged production painter',()=>{
 it.each(['round','chisel'].flatMap(nib=>[true,false].flatMap(film=>[12,400].flatMap(size=>[false,true].map(segmented=>({nib,film,size,segmented}))))))('exact production bytes $nib film=$film size=$size segmented=$segmented',({nib,film,size,segmented})=>{
  const {engine}=createTestEngine({paper:'flat'},{width:64,height:64});engine.initLayer('L');const probe=engine as unknown as Probe,painter=probe._ribbonPainter;
  painter.diagnosticSegmentDelivery=segmented?'combined':false;painter.diagnosticSolventField=segmented;
  const ctx=(painter as unknown as {ctx:RibbonStrokePainterContext}).ctx;
  const bands=vi.spyOn(ctx,'drawRibbonBands').mockImplementation(()=>{});const minmax=vi.spyOn(ctx,'minmaxExt').mockReturnValue(film?{MAX_EXT:0x8008}:null);
  const seam=painter as unknown as {prepareDelivery(...args:DeliveryArgs):Delivery};const original=seam.prepareDelivery;let input:DeliveryArgs|undefined,result:Delivery|undefined;
  const delivery=vi.spyOn(seam,'prepareDelivery').mockImplementation(function(...args){input=args;result=original.apply(painter,args);return result});
  const presetName=`normal:100:100:PB29:${nib}`,preset=probe._resolvePreset('watercolor',presetName),profile=ribbonProfileFor('watercolor',presetName,0);
  const dabs:Dab[]=[0,1,2,3].map(i=>({x:12+i*9,y:i===2?30:22,pressure:[.9,.5,.1,0][i],tiltX:0,tiltY:0,size:size-i*(size/6),aspectRatio:nib==='chisel'?2:1,angle:.7,opacity:1,t:i*25}));
  const previous={...dabs[0],x:3,t:-25};const scratch=new RibbonStrokeScratch(probe._ribbonScratchPool,true,true);
  try{
   for(const _ of painter.paint(probe._layers.get('L')!,dabs,preset,presetName,profile,[.2,.1,.5],scratch,previous,'0f37',[1,2],false,0,{waterOnly:false,segmented}))void _;
   expect(input).toBeDefined();expect(result).toBeDefined();expect(input![9]).toBe(film);
   const a=input!,r=result!;const prepared=prepareCanonicalRibbonBands({dabs:a[0],previous:a[1],sizeMultiplier:preset.sizeMultiplier,profile:a[3],film:a[9],segmented,solventField:segmented,wetOf:a[5],delivery:{water:r.waterByDab,pigment:r.pigmentByDab,excess:r.excessByDab,haloShed:new Map(),paperWet:r.paperWetByDab,puddle:r.puddleByDab,pigmentPool:r.pigmentPoolByDab}});
   const production=bands.mock.calls.filter(call=>call[3]==='ink'||call[3]==='ink-max');expect(production.length).toBeGreaterThan(0);
   const digest=createHash('sha256').update(new Uint8Array(production[0][2].buffer,production[0][2].byteOffset,production[0][2].byteLength)).digest('hex');const key=`${nib}-${film}-${size}-${segmented}`;
   if(process.env.WC_GENERATE_GOLDEN==='1'){golden[key]=digest;writeFileSync(goldenPath,JSON.stringify(golden,null,2)+'\n')}else expect(digest).toBe(golden[key]);
   for(const call of production){const actual=new Uint32Array(call[2].buffer,call[2].byteOffset,call[2].length);expect([prepared.bands,prepared.solventBands].some(expected=>expected.length===call[2].length&&new Uint32Array(expected.buffer).every((value,i)=>value===actual[i]))).toBe(true);}
   const coverage=bands.mock.calls.filter(call=>call[3]==='coverage');expect(coverage.length).toBeGreaterThan(0);for(const call of coverage)expect(new Uint32Array(prepared.waterBands.buffer)).toEqual(new Uint32Array(call[2].buffer,call[2].byteOffset,call[2].length));
   expect(prepared.bands.length%11).toBe(0);if(segmented){expect(prepared.waterBands).not.toBe(prepared.bands);expect(prepared.solventBands.length).toBeGreaterThan(0)}else{expect(prepared.waterBands).toBe(prepared.bands);expect(prepared.solventBands.length).toBe(0)};
  }finally{delivery.mockRestore();bands.mockRestore();minmax?.mockRestore();scratch.destroy();engine.destroy()}
 });
});

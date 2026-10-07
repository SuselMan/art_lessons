import { describe,it,expect } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { prepareRibbonDelivery,createRibbonDeliveryState,type RibbonDeliveryOptions } from './ribbonDelivery'
import { prepareDrawableRibbonDabs,noteRibbonWetContacts,ribbonSegmentLength } from './ribbonDrawable'
import { ribbonProfileFor } from './ribbonProfile'
import type { PencilPreset } from '../presets/pencilPresets'
import { createTestEngine } from '../../testing/engineTestUtils'


const serialize=(value:unknown):unknown=>value instanceof Map?[...value].map(([key,v])=>[key,v]):typeof value==='function'?undefined:value;
describe('CPU-only delivery owner across live-sized batches',()=>{
 it.each([false,true])('same clocks, doses, contacts and pressure across splitting, film=%s',film=>{
  const {engine}=createTestEngine({paper:'flat'},{width:64,height:64});
  const preset= (engine as unknown as {_resolvePreset(t:string,n:string):PencilPreset})._resolvePreset('watercolor','normal:100:100:PB29:chisel');engine.destroy();
  const profile=ribbonProfileFor('watercolor','normal:100:100:PB29:chisel',0);
  const dabs:Dab[]=Array.from({length:21},(_,i)=>({x:i<12?10+i*3:43-(i-11)*4,y:20+(i%3)*2,pressure:i<18?.8:(21-i)/30,tiltX:0,tiltY:0,size:20,aspectRatio:2,angle:.6,opacity:.9,t:Math.floor(i/3)*40}));
  const wet='0037ff370000037ff7000';
  const options:RibbonDeliveryOptions={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true};
  const run=(cuts:number[])=>{const state=createRibbonDeliveryState(),pool=new WeakMap<Dab,number>(),rows:unknown[]=[];let from=0;
   for(const to of cuts){const prepared=prepareDrawableRibbonDabs(dabs.slice(from,to),undefined,preset,profile,state,wet.slice(from,to));from=to;if(!prepared.drawable.length)continue;
    noteRibbonWetContacts(state,prepared.drawable,preset,prepared.wetOf);
    const result=prepareRibbonDelivery(prepared.drawable,prepared.previous,preset,profile,state,prepared.wetOf,0,'combined',true,film,{markerSegmentLength:ribbonSegmentLength,dabPool:()=>pool},options);
    for(const [index,dab]of prepared.drawable.entries())rows.push({dab,deposit:result.deposits[index],water:result.waterByDab.get(dab),pigment:result.pigmentByDab.get(dab),excess:result.excessByDab.get(dab),puddle:result.puddleByDab.get(dab),paperWet:result.paperWetByDab.get(dab),pool:pool.get(dab),across:result.acrossByDab.get(dab),moving:result.movingByDab.has(dab)});
   }
   return {rows,state:JSON.parse(JSON.stringify(state,(_key,value)=>serialize(value)))};
  };
  const baseline=run([dabs.length]);expect(run([1,2,6,10,13,17,21])).toEqual(baseline);expect(run(Array.from({length:21},(_,i)=>i+1))).toEqual(baseline);expect(baseline.rows.length).toBeGreaterThan(0);
 });
 it('wet indexing remains original after subpixel filtering; recorded inputs untouched',()=>{
  const state=createRibbonDeliveryState(),profile={...ribbonProfileFor('watercolor','normal:100:100:PB29:round',0),minHalfWidthPx:null};
  const preset={sizeMultiplier:1} as PencilPreset;
  const dabs:Dab[]=[.2,12,12].map((size,i)=>({x:i*20,y:10,size,angle:0,pressure:.5,aspectRatio:1,opacity:1,t:i*10,tiltX:0,tiltY:0}));const before=JSON.stringify(dabs);
  const prepared=prepareDrawableRibbonDabs(dabs,undefined,preset,profile,state,'0f3');expect(prepared.drawable.length).toBe(2);expect(prepared.wetOf(prepared.drawable[0])).toBe(1);expect(prepared.wetOf(prepared.drawable[1])).toBe(3/15);expect(JSON.stringify(dabs)).toBe(before);
 });
});

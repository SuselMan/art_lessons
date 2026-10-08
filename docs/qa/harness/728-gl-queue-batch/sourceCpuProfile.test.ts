import {expect,it,vi} from'vitest'
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto'
import{createTestEngine}from'../../../../apps/web/src/engine/testing/engineTestUtils'
import{RibbonStrokeScratch}from'../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import{AccumulationBuffer}from'../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import{ribbonProfileFor}from'../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import{RibbonStrokePainter,sourceCpuMetrics}from'../../../../temp/device-runs/RibbonStrokePainterCpuProfile'
it('profiles actual CPU source stages with ordered command collector, no GPU timing claim',()=>{
 const source=readFileSync('apps/web/src/engine/src/dabs/ribbonBandBatch.test.ts','utf8'),final8=JSON.parse(source.match(/const final8[^\n]* = (\{[^\n]+\})/)![1]);const results=[];
 const run=(profiled:boolean,band:boolean)=>{
 const{engine}=createTestEngine({paper:'flat',pageWidth:2048,pageHeight:2048},{width:64,height:64});engine.initLayer('L');const gl=engine.gl;const e=engine as any,original=e._ribbonPainter,ctx=original.ctx,painter=profiled?new RibbonStrokePainter(ctx):original;
 for(const key of Object.keys(original))if(typeof original[key]==='boolean'||typeof original[key]==='string')painter[key]=original[key];
 painter.diagnosticBandBatch=band;painter.diagnosticSegmentDelivery='combined';painter.diagnosticSolventField=true;painter.diagnosticForeignSolvent=false;painter.diagnosticPigmentRecord=true;
 const spies=[];for(const name of['drawArrays','clear','copyTexSubImage2D','copyTexImage2D','texImage2D','texSubImage2D'])spies.push(vi.spyOn(gl as any,name).mockImplementation(()=>{}));
 const commands:any[]=[];for(const name of['drawRibbonNibPass','drawRibbonBands','drawRibbonCompositeRect','fieldOp'])spies.push(vi.spyOn(ctx,name).mockImplementation((...args:any[])=>{commands.push([name,...args])}));
 spies.push(vi.spyOn(ctx,'minmaxExt').mockReturnValue({MAX_EXT:0x8008}));
 const name='normal:100:100:PB29:round',preset=e._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name,0),scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true);
 let deliveryMs=0,deliveryCalls=0;const delivery=(painter as any).prepareDelivery;spies.push(vi.spyOn(painter as any,'prepareDelivery').mockImplementation(function(this:any,...args:any[]){const at=performance.now();try{return delivery.apply(this,args)}finally{deliveryMs+=performance.now()-at;deliveryCalls++}}));
 for(const key of Object.keys(sourceCpuMetrics))delete sourceCpuMetrics[key];
 const at=performance.now();try{for(const _ of painter.paint(e._layers.get('L'),final8.dabs.map((d:any)=>({...d})),preset,name,profile,[.2,.1,.5],scratch,{...final8.prev},'00000000',[1,2]))void _;
 const elapsedMs=performance.now()-at;
 const normalize=(v:any):any=>{if(v instanceof Float32Array)return{F32:Array.from(new Uint32Array(v.buffer,v.byteOffset,v.length))};if(v instanceof AccumulationBuffer)return{bufferWidth:v.width,bufferHeight:v.height};if(v?.buffer instanceof AccumulationBuffer)return{tileX:v.originX,tileY:v.originY,width:v.buffer.width,height:v.buffer.height};if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)]));return v};
 const hash=createHash('sha256').update(JSON.stringify(normalize(commands))).digest('hex');return{profiled,band,elapsedMs,deliveryMs,deliveryCalls,commandCount:commands.length,commandSHA:hash,stages:profiled?structuredClone(sourceCpuMetrics):null};
 }finally{for(const s of spies)s.mockRestore();scratch.destroy();engine.destroy()}}
 for(const [profiled,band]of[[false,false],[true,false],[false,true],[true,true]])results.push(run(profiled,band));
 for(let k=0;k<3;k++){run(false,false);run(false,true)}
 const bench=[];for(let k=0;k<8;k++){const order=k%2?[true,false]:[false,true],row:any={order};for(const band of order){const value=run(false,band);expect(value.commandSHA).toBe(results[0].commandSHA);row[band?'on':'off']=value.elapsedMs}bench.push(row)}
 for(const result of results)expect(result.commandSHA).toBe(results[0].commandSHA);expect(results[0].commandCount).toBeGreaterThan(10);
 writeFileSync('temp/device-runs/source-cpu-profile.json',JSON.stringify({scope:'Linux Node actual RibbonStrokePainter final8 with mocked GL primitive/copy/clear/upload command collection. NOT actual GPU/Room timing. Includes collector overhead and resource-owner CPU logic; stage timestamps nested, do not sum.',results,bench},null,2));
},20000)

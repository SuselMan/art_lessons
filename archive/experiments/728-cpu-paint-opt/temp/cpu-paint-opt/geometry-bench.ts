import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { buildRibbonBands } from '../../apps/web/src/engine/src/dabs/markerRibbon'
import { buildRibbonBandBatch } from '../../apps/web/src/engine/src/dabs/ribbonBandBatch'
import { buildRibbonBands as baseline } from './markerRibbon-baseline'
const text=readFileSync('apps/web/src/engine/src/dabs/ribbonBandBatch.test.ts','utf8')
const actual=JSON.parse(text.match(/const final8:.*? = (\{.*\})\n/)![1])
const materials=[(_a:any,d:any,t:number)=>({ink:d.opacity*t*.137,water:.713,paperWet:.317,strength:.923,puddle:.67,pigmentPool:.49}),(_a:any,d:any,t:number)=>({ink:d.opacity*t*.137,water:.713,paperWet:d.pressure*.27,strength:.923,puddle:.67,pigmentPool:.49}),(_a:any,d:any)=>({ink:d.pressure*.193/4,water:1,paperWet:0,strength:0,puddle:0,pigmentPool:0})]
const scenarios=[{name:'actual-final8',dabs:actual.dabs,prev:actual.prev},{name:'dense-round400',prev:undefined,dabs:Array.from({length:100},(_,i)=>({...actual.prev,x:500+Math.cos(i*.13)*210,y:700+Math.sin(i*.13)*210,size:400,pressure:.8,aspectRatio:1,angle:0}))},{name:'turning-chisel400',prev:undefined,dabs:Array.from({length:40},(_,i)=>({...actual.prev,x:i*11,y:Math.sin(i*.21)*60,size:400-i*2,pressure:.8-i*.015,aspectRatio:2.4,angle:i*.043}))}]
const results=[]
for(const s of scenarios)for(const shape of ['ellipse','roundedBox'] as const){
 const run=(fn:any)=>materials.map(m=>fn(s.dabs,1,s.prev,shape,.23,.71,m,true)); const funcs={baseline:()=>run(baseline),current:()=>run(buildRibbonBands),batch:()=>buildRibbonBandBatch(s.dabs,1,s.prev,shape,.23,.71,materials,true)}
 const expected=funcs.baseline(); for(const[name,fn]of Object.entries(funcs)){const output=fn(); if(output.some((a:any,i:number)=>Buffer.compare(Buffer.from(a.buffer,a.byteOffset,a.byteLength),Buffer.from(expected[i].buffer))!==0))throw Error('parity'+name+s.name)}
 const trials:any={}; for(const name of Object.keys(funcs))trials[name]=[]
 const rounds=s.name==='actual-final8'?20:8
 for(let trial=0;trial<5;trial++)for(const name of (trial%2?Object.keys(funcs).reverse():Object.keys(funcs))){const fn=(funcs as any)[name];for(let i=0;i<3;i++)fn();const start=performance.now();for(let i=0;i<rounds;i++)fn();trials[name].push((performance.now()-start)/rounds)}
 const median=(a:number[])=>a.toSorted((x,y)=>x-y)[a.length>>1];results.push({scenario:s.name,shape,bytes:expected.reduce((a:any,b:any)=>a+b.byteLength,0),trials,medianMs:Object.fromEntries(Object.entries(trials).map(([k,v])=>[k,median(v as number[])]))})
}
writeFileSync('temp/cpu-paint-opt/geometry-bench.json',JSON.stringify({scope:'Node CPU synthetic kernel; not device latency; exact Float32 bytes for all cases',results},null,2))
console.log(JSON.stringify(results.map(x=>({scenario:x.scenario,shape:x.shape,...x.medianMs})),null,2))

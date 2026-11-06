import{it,expect,beforeAll,vi}from'vitest'
import{readFileSync}from'node:fs'
import{createHash}from'node:crypto'
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex')
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{MYPAINT_SCHEMA}from'@grafetto/shared'
import{prepareMyPaintKernel,mypaintKernel}from'../presets/mypaintKernel'
import{MyPaintStrokePainter}from'./MyPaintStrokePainter'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
const pixels=256
beforeAll(async()=>{const bytes=readFileSync(new URL('../../../../public/brush-kernels/mypaint-1.6.1.wasm',import.meta.url)),old=globalThis.fetch;globalThis.fetch=vi.fn(async()=>new Response(bytes));try{await prepareMyPaintKernel()}finally{globalThis.fetch=old}})
function paint(chunks:number,seed=123,opacity=1,foreign=false,stats?:{reads:number}){
 const data=new Uint8Array(pixels*pixels*4),buffer={contentRevision:0,width:pixels,height:pixels,readPixelsRegion(x:number,y:number,w:number,h:number){if(stats)stats.reads++;const out=new Uint8Array(w*h*4);for(let row=0;row<h;row++)out.set(data.subarray(((y+row)*pixels+x)*4,((y+row)*pixels+x+w)*4),row*w*4);return out},writePixelsRegion(x:number,y:number,w:number,h:number,v:Uint8Array){this.contentRevision++;for(let row=0;row<h;row++)data.set(v.subarray(row*w*4,(row+1)*w*4),((y+row)*pixels+x)*4)}},target={resolveForPaint:()=>[{buffer,originX:0,originY:0}],resolveExistingForPaint:()=>[{buffer,originX:0,originY:0}],markContentPainted:()=>{}}as unknown as ILayerBuffer
 const descriptor={mypaint:{version:1,kernel:'libmypaint-1.6.1',baseRadius:4,erase:false,settings:[{id:MYPAINT_SCHEMA.settings.find(x=>x.name==='offset_by_random')!.id,base:.3,inputs:[]}]}}as unknown as BrushDescriptor,execution={brushRandom:{version:1 as const,strokeSeed:seed,sequentialSeed:1}},scratch={}as BehaviorScratch,painter=new MyPaintStrokePainter(),dabs=Array.from({length:30},(_,i)=>({x:30+i*5,y:120+20*Math.sin(i/3),size:8,pressure:.5,opacity,tiltX:0,tiltY:0,sourceTime:i*16})as Dab)
 try{for(let i=0;i<dabs.length;i+=chunks){if(foreign&&i===1){data.fill(255);buffer.contentRevision++}painter.paint(target,dabs.slice(i,i+chunks),descriptor,[.8,.1,.2],{size:true,opacity:true},scratch,execution,i+chunks>=dabs.length)}return data}finally{scratch.brushNative?.destroy();painter.destroy()}
}
it('original WASM rasterizer produces the same canvas across input batches',()=>{const all=paint(30),single=paint(1);expect(hash(all)).toBe('078e0ac38b27ae6ea9c7bca8d1d4439129286c500df8c057615c8c9785333278');expect(hash(single)).toBe(hash(all));expect(all.some((v,i)=>i%4===3&&v>0)).toBe(true);expect(hash(paint(7))).toBe(hash(all))})
it('binds randomness to gesture seed and keeps bounded initial memory',()=>{expect(hash(paint(30,321))).not.toBe(hash(paint(30,123)));expect(mypaintKernel().memory.buffer.byteLength).toBeLessThan(8*1024*1024)})

it('reuses unchanged GPU regions and refreshes them after a foreign write',()=>{const stats={reads:0};paint(1,123,1,false,stats);expect(stats.reads).toBeLessThan(20);const data=paint(1,123,1,true);expect(data[((255-64)*256)*4+3]).toBe(255)})

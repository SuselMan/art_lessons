import{it,expect,beforeAll,vi}from'vitest'
import{readFileSync}from'node:fs'
import type{Dab}from'@grafetto/shared'
import{prepareMyPaintKernel}from'../presets/mypaintKernel'
import{MyPaintStrokePainter}from'./MyPaintStrokePainter'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
const pixels=256
beforeAll(async()=>{const bytes=readFileSync(new URL('../../../../public/brush-kernels/mypaint-1.6.1.wasm',import.meta.url)),old=globalThis.fetch;globalThis.fetch=vi.fn(async()=>new Response(bytes));try{await prepareMyPaintKernel()}finally{globalThis.fetch=old}})
import{mypaint177}from'../../../../../../packages/shared/src/mypaintTimer177.testFixture'
function paint(chunks:number,seed=123,opacity=1,foreign=false,stats?:{reads:number},legacy=false,invalidTime=false){
 const data=new Uint8Array(pixels*pixels*4),buffer={contentRevision:0,width:pixels,height:pixels,readPixelsRegion(x:number,y:number,w:number,h:number){if(stats)stats.reads++;const out=new Uint8Array(w*h*4);for(let row=0;row<h;row++)out.set(data.subarray(((y+row)*pixels+x)*4,((y+row)*pixels+x+w)*4),row*w*4);return out},writePixelsRegion(x:number,y:number,w:number,h:number,v:Uint8Array){this.contentRevision++;for(let row=0;row<h;row++)data.set(v.subarray(row*w*4,(row+1)*w*4),((y+row)*pixels+x)*4)}},target={resolveForPaint:()=>[{buffer,originX:0,originY:0}],resolveExistingForPaint:()=>[{buffer,originX:0,originY:0}],markContentPainted:()=>{}}as unknown as ILayerBuffer
 const descriptor=mypaint177(20,false,foreign),execution={brushRandom:{version:1 as const,strokeSeed:seed,sequentialSeed:1}},scratch={}as BehaviorScratch,painter=new MyPaintStrokePainter(),dabs=Array.from({length:30},(_,i)=>({x:30+i*5,y:120+20*Math.sin(i/3),size:8,pressure:.5,opacity,tiltX:0,tiltY:0,sourceTime:i*16})as Dab)
 if(foreign)data.fill(255)
 if(legacy){descriptor.version=156;delete descriptor.behavior!.spacing;descriptor.behavior!.timing={version:1,rate:60,ignoreDistanceSpacing:false}}
 if(invalidTime)Reflect.deleteProperty(dabs[1],'sourceTime')
 try{for(let i=0;i<dabs.length;i+=chunks){painter.paint(target,dabs.slice(i,i+chunks),descriptor,[.8,.1,.2],{size:true,opacity:true},scratch,execution,i+chunks>=dabs.length)}return data}finally{scratch.brushNative?.destroy();painter.destroy()}
}

it('177 usesSAMEactuallegacyWASM withallnativeinternalsettings preserved whole/chunks/old156',()=>{const whole=paint(30);expect(whole.some((v,i)=>i%4===3&&v>0)).toBe(true);expect(paint(1)).toEqual(whole);expect(paint(7)).toEqual(whole);expect(paint(30,123,1,false,undefined,true)).toEqual(whole);expect(paint(30,321)).not.toEqual(whole);expect(paint(30,123,.5)).not.toEqual(whole)})
it('existingnativeerase boolean still usesSAMEkernel/mirror withoutneweraseowner',()=>{const bytes=paint(30,123,1,true);expect(bytes.some((v,i)=>i%4===3&&v<255)).toBe(true)})
it('missingtime/seed andmalformedpolicy failbeforeoldnativeowner/targetmutation',()=>{const p=new MyPaintStrokePainter(),destroy=vi.fn(),scratch={brushNative:{destroy}}as unknown as BehaviorScratch,target={resolveForPaint:vi.fn(),resolveExistingForPaint:vi.fn()}as unknown as ILayerBuffer,b=mypaint177(),dab={x:1,y:1,size:8,pressure:.5,opacity:1,t:0,sourceTime:0,tiltX:0,tiltY:0,angle:0,aspectRatio:1};try{expect(()=>p.paint(target,[dab],b,[1,0,0],{size:true,opacity:true},scratch)).toThrow('context');const x={...dab};Reflect.deleteProperty(x,'sourceTime');expect(()=>p.paint(target,[x],b,[1,0,0],{size:true,opacity:true},scratch,{brushRandom:{version:1,strokeSeed:1,sequentialSeed:2}})).toThrow();const bad={...dab,sourceTime:-1};expect(()=>p.paint(target,[bad],b,[1,0,0],{size:true,opacity:true},scratch,{brushRandom:{version:1,strokeSeed:1,sequentialSeed:2}})).toThrow();expect(destroy).not.toHaveBeenCalled();expect(target.resolveForPaint).not.toHaveBeenCalled();expect(()=>paint(30,123,1,false,undefined,false,true)).toThrow()}finally{p.destroy()}})

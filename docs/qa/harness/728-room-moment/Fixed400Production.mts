import assert from 'node:assert/strict'
import { PointerInput } from '../../../../apps/web/src/engine/src/input/PointerInput.ts'
import { DabSystem } from '../../../../apps/web/src/engine/src/dabs/DabSystem.ts'
import { mottleSeedFromStrokeId } from '../../../../apps/web/src/engine/src/presets/watercolorPresets.ts'
import { fixed400Tape } from './Fixed400Tape.mjs'
const arm=()=>fixed400Tape().map(stroke=>{
 const canvas={width:1024,height:1024,style:{},addEventListener(){},removeEventListener(){},setPointerCapture(){},releasePointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:1024,height:1024})} as unknown as HTMLCanvasElement
 const input=new PointerInput(canvas),dabs=new DabSystem(),out:unknown[]=[]
 input.setTransform((x,y)=>({x,y}))
 input.on('start',p=>out.push(...dabs.startStroke(p.x,p.y,p.pressure,p.tiltX,p.tiltY,400,p.speed)))
 input.on('move',p=>out.push(...dabs.continueStroke(p.x,p.y,p.pressure,p.tiltX,p.tiltY,400,p.speed)))
 input.on('end',p=>out.push(...dabs.endStroke(400,p.speed)))
 const ev=(s:any)=>({clientX:s.worldX,clientY:s.worldY,pressure:.8,tiltX:0,tiltY:0,pointerType:'pen',pointerId:728,button:0,buttons:1,timeStamp:s.elapsedMs,preventDefault(){},stopPropagation(){}})
 ;(input as any)._handleDown(ev({worldX:300,worldY:300,elapsedMs:0}))
 for(const frame of stroke.frames){const samples=frame.map(ev),event=samples.at(-1);event.getCoalescedEvents=()=>samples;(input as any)._handleMove(event)}
 ;(input as any)._handleUp({...ev({worldX:600,worldY:500,elapsedMs:1800}),buttons:0})
 return {id:stroke.strokeId,seed:mottleSeedFromStrokeId(stroke.strokeId),preset:stroke.preset,color:stroke.color,out}
})
const a=arm(),b=arm();assert.deepEqual(a,b);assert.ok(a.every(s=>s.out.length>10));assert.ok(a.every(s=>s.seed.every(Number.isFinite)))
console.log(JSON.stringify({pass:true,scope:'Production PointerInput + DabSystem CPU geometry/seeds, excludes live wet/GL',strokes:a.map(s=>({id:s.id,seed:s.seed,dabCount:s.out.length,preset:s.preset}))}))

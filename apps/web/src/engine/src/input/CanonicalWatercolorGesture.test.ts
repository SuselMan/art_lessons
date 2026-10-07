import { describe,it,expect,vi } from 'vitest'
import { strokeDabs, type Operation } from '@grafetto/shared'
import { createTestEngine,makeLayerAdd } from '../../testing/engineTestUtils'
import { CanonicalWatercolorGesture,type BakedWatercolorChunk } from './CanonicalWatercolorGesture'
import type { PointerData } from './PointerInput'
import { PaperWetness } from '../paper/paperWetness'

describe('canonical watercolor input boundary',()=>{
 it.each([['round',false],['chisel',false],['round',true],['chisel',true]] as const)('same production packed dabs/wet and event batches: %s wet=%s',async (nib,prewet)=>{
  const clock=vi.spyOn(performance,'now').mockReturnValue(1000)
  const preset=`normal:100:100:PB29:${nib}`,production:Operation[]=[],native:Operation[]=[],chunks:BakedWatercolorChunk[]=[],batches:unknown[]=[]
  const {engine}=createTestEngine({pencilType:preset,size:400,opacity:.75,graphiteColor:[.2,.3,.6],onLocalOperation:op=>production.push(op)},{width:64,height:64})
  await engine.paperReady();engine.setTool('watercolor');engine.appendOperation(makeLayerAdd('u','L'));engine.setActiveLayer('L');production.length=0
  const e=engine as unknown as Record<string,any>
  vi.spyOn(e,'_paintDabs').mockImplementation((...args:any[])=>{batches.push({dabs:structuredClone(args[1]),wet:args[10]??''});return undefined})
  vi.spyOn(e,'_finishRibbonStroke').mockImplementation(()=>undefined)
  const paper=new PaperWetness(),input=new CanonicalWatercolorGesture({paperWet:paper,now:()=>performance.now(),timestamp:()=>123,operationId:()=>`op${native.length}`,onPreparedChunk:chunk=>{chunks.push({...chunk,dabs:structuredClone(chunk.dabs)});return undefined},onLocalStroke:op=>native.push(op)})
  if(prewet){paper.deposit('L',300,30,300,1,1000,false);e._paperWet.deposit('L',300,30,300,1,1000,false)}
  const tape:PointerData[]=Array.from({length:36},(_,i)=>({x:10+i*90,y:30+Math.sin(i)*40,pressure:.9-(i%13)*.055,tiltX:10,tiltY:15,speed:.8,pointerType:'pen',timeStamp:100+i*17}))
  e._onStart(tape[0]);input.begin(tape[0],{tool:'watercolor',preset,color:[.2,.3,.6],size:400,opacity:.75,nibAngle:{angle:e._nibAngleRadians,anchor:e._nibAnchor},tiltResponse:e._tiltResponse},{strokeId:e._strokeId,washId:e._washId,layerId:'L',userId:e._userId})
  for(const event of tape.slice(1)){e._onMove(event);input.move(event)}
  e._onEnd(tape.at(-1));input.end(tape.at(-1)!)
  const normalized=(ops:Operation[])=>ops.filter(op=>op.type==='stroke').map(({id:_id,timestamp:_timestamp,...op})=>op)
  expect(normalized(native)).toEqual(normalized(production))
  expect(chunks.map(chunk=>({dabs:chunk.dabs,wet:chunk.wet}))).toEqual(batches)
  expect(native.length).toBeGreaterThan(1)
  const strokes=native.filter(op=>op.type==='stroke')
  for(let i=0;i<strokes.length;i++){
   const recorded=strokeDabs(strokes[i]),parts=chunks.filter(chunk=>chunk.operationIndex===i)
   expect(parts.reduce((sum,part)=>sum+part.dabs.length,0)).toBe(recorded.length)
   expect(parts.map(part=>part.wet).join('')).toBe(strokes[i].wet??'0'.repeat(recorded.length))
   expect(parts[0].dabOffset).toBe(strokes.slice(0,i).reduce((sum,op)=>sum+strokeDabs(op).length,0))
  }
  expect(chunks.some(chunk=>chunk.operationIndex>0&&chunk.dabOffset>0)).toBe(true)
  engine.destroy();clock.mockRestore()
 })
 it('rejects unsupported tools and overlapping gestures; end without begin has no side effects',()=>{
  const onLocalStroke=vi.fn(),input=new CanonicalWatercolorGesture({paperWet:new PaperWetness(),now:()=>0,timestamp:()=>0,operationId:()=>'',onPreparedChunk:()=>{},onLocalStroke})
  const event={x:0,y:0,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp:0} as PointerData
  input.end(event);expect(onLocalStroke).not.toHaveBeenCalled()
  expect(()=>input.begin(event,{tool:'pencil'} as any,{strokeId:'s',layerId:'L',userId:'u'})).toThrow('Only canonical watercolor')
  const settings={tool:'watercolor',preset:'normal:100:100:PB29:round',color:[.2,.3,.4],size:20,opacity:1,nibAngle:{angle:0,anchor:'canvas'},tiltResponse:'smooth'} as any
  input.begin(event,settings,{strokeId:'s',layerId:'L',userId:'u'})
  expect(()=>input.begin(event,settings,{strokeId:'s2',layerId:'L',userId:'u'})).toThrow('Finish the current gesture')
  input.end(event)
 })
})

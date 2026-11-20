import { describe,expect,it } from 'vitest'
import { isBrushBehavior } from '@grafetto/shared'
import { normalizedBrushSpeed } from './brushSpeed'
import { PointerInput,type PointerData } from './PointerInput'
const profile={version:1 as const,space:'view' as const,maximum:30,estimator:'grafettoEMA30ms' as const}
function run(zoom:number,times:number[]):PointerData[]{
 const handlers=new Map<string,(e:PointerEvent)=>void>()
 const canvas={width:100,height:100,style:{},addEventListener:(name:string,fn:(e:PointerEvent)=>void)=>handlers.set(name,fn),removeEventListener:()=>{},setPointerCapture:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})} as unknown as HTMLCanvasElement
 const input=new PointerInput(canvas),seen:PointerData[]=[]
 input.setTransform((x,y)=>({x:x/zoom,y:y/zoom}));input.on('start',d=>seen.push(d));input.on('move',d=>seen.push(d))
 const event=(i:number):PointerEvent=>({button:0,pointerId:1,pointerType:'pen',pressure:1,clientX:i*30,clientY:0,timeStamp:times[i],preventDefault:()=>{}} as PointerEvent)
 handlers.get('pointerdown')!(event(0))
 for(let i=1;i<times.length;i++)handlers.get('pointermove')!(event(i))
 input.destroy();return seen
}
describe('view-speed capture before canvas geometry',()=>{
 it('normalizes once, preserves explicit zero and keeps historical profiles absent',()=>{
  expect(normalizedBrushSpeed({viewSpeed:15},profile)).toBe(.5)
  expect(normalizedBrushSpeed({viewSpeed:30,normalizedSpeed:0},profile)).toBe(0)
  expect(normalizedBrushSpeed({viewSpeed:300},profile)).toBe(1)
  expect(normalizedBrushSpeed({viewSpeed:15},undefined)).toBeUndefined()
  expect(normalizedBrushSpeed({normalizedSpeed:.123456789},profile)).toBe(Math.fround(.123456789))
  expect(()=>normalizedBrushSpeed({viewSpeed:Infinity},profile)).toThrow(/Non-finite/)
 })
 it('captures the same view speed at different canvas zoom without replacing world speed',()=>{
  const times=[0,10,20,30,40]
  const low=run(.5,times),high=run(2,times)
  expect(low.map(d=>normalizedBrushSpeed(d,profile))).toEqual(high.map(d=>normalizedBrushSpeed(d,profile)))
  expect(low.at(-1)!.speed).toBeCloseTo(high.at(-1)!.speed*4)
  expect(low.at(-1)!.viewSpeed).toBeCloseTo(3)
 })
 it('never manufactures speed from zero elapsed samples and averages the entire group next',()=>{
  const seen=run(1,[0,0,0,0,40])
  expect(seen.slice(0,4).map(d=>d.viewSpeed)).toEqual([0,0,0,0])
  expect(seen.at(-1)!.viewSpeed).toBeCloseTo(3)
  expect(normalizedBrushSpeed(seen.at(-1)!,profile)).toBe(Math.fround(.1))
 })
 it('guards immutable profile bounds and version',()=>{
  expect(isBrushBehavior({version:2,speedInput:profile})).toBe(true)
  for(const speedInput of [{...profile,maximum:0},{...profile,maximum:Infinity},{...profile,space:'canvas'},{...profile,version:2}])expect(isBrushBehavior({version:2,speedInput})).toBe(false)
 })
})

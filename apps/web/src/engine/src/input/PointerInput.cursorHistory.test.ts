import { expect,it } from 'vitest'
import { PointerInput } from './PointerInput'
function fixture(){
  const listeners=new Map<string,(e:PointerEvent)=>void>()
  const canvas={width:100,height:100,style:{},addEventListener:(name:string,fn:(e:PointerEvent)=>void)=>listeners.set(name,fn),removeEventListener(){},setPointerCapture(){},releasePointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})} as unknown as HTMLCanvasElement
  const input=new PointerInput(canvas)
  const emit=(type:string,extra:Partial<PointerEvent>={})=>listeners.get(type)?.({pointerId:1,pointerType:'pen',clientX:0,clientY:0,pressure:0,buttons:0,button:0,timeStamp:0,...extra}as PointerEvent)
  return {input,emit}
}
it('observes real hover without seeding speed and excludes touch/foreign-owner/prediction points',()=>{
  const {input,emit}=fixture(),observed:number[]=[],speeds:number[]=[]
  try{
    input.setTransform((x,y)=>({x:x*2,y:y*2}))
    input.onCursor(p=>observed.push(p.x)).on('move',p=>speeds.push(p.speed)).onPredict(()=>{})
    emit('pointermove',{clientX:500})
    emit('pointermove',{pointerType:'touch',clientX:400})
    emit('pointerdown',{clientX:0,pressure:.5,buttons:1})
    emit('pointermove',{pointerId:2,clientX:300,pressure:.5,buttons:1})
    emit('pointermove',{clientX:10,timeStamp:10,pressure:.5,buttons:1,getPredictedEvents:()=>[{pointerId:1,clientX:1000,clientY:0,timeStamp:20,pressure:.5,pointerType:'pen'}as PointerEvent]})
    expect(observed).toEqual([1000,20])
    expect(speeds).toEqual([2])
  }finally{input.destroy()}
})
it('observes each coalesced genuine point once, never appending the host batch again',()=>{
  const {input,emit}=fixture(),xs:number[]=[]
  try{
    input.onCursor(p=>xs.push(p.x))
    const point=(x:number)=>({clientX:x,clientY:0,pointerType:'mouse',pointerId:1,buttons:0,pressure:0}as PointerEvent)
    emit('pointermove',{pointerType:'mouse',clientX:30,getCoalescedEvents:()=>[point(10),point(20),point(30)]})
    expect(xs).toEqual([10,20,30])
  }finally{input.destroy()}
})

import {expect,it,vi} from 'vitest'
import type {ILayerBuffer} from '../../buffers/ILayerBuffer'
const memory=vi.hoisted(()=>({allocations:0,copies:0}))
vi.mock('../../buffers/AccumulationBuffer',()=>({AccumulationBuffer:class{
  width:number;height:number;pixels:Uint8Array
  constructor(_gl:unknown,w:number,h:number){this.width=w;this.height=h;this.pixels=new Uint8Array(w*h*4);memory.allocations++}
  clear(){this.pixels.fill(0)}
  copyTo(other:{pixels:Uint8Array}){memory.copies++;other.pixels.set(this.pixels)}
  readPixels(){return this.pixels.slice()}
  restorePixelsRect(_w:number,_h:number,pixels:Uint8Array){this.pixels.set(pixels)}
  destroy(){}
}}))

vi.mock('./PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:vi.fn(()=>({}))})}))
vi.mock('./PuddlePresentation',()=>({createPuddlePresentation:()=>{
 let shown=new Uint8Array()
 // Exact INPUT alpha branch for this fixture's R=G=B=A material. This is
 // an owned byte-image display model, not a WebGL watercolor shader oracle.
 return{invalidate(){},destroy(){},reset(buffer:{pixels:Uint8Array}){shown=buffer.pixels.slice()},setTarget(){},
  acceptInput(before:{pixels:Uint8Array},after:{pixels:Uint8Array}){
   if(shown.length!==after.pixels.length)shown=new Uint8Array(after.pixels.length)
   for(let i=0;i<shown.length;i+=4){const b=before.pixels[i+3]/255,a=after.pixels[i+3]/255,current=shown[i+3]/255
    if(Math.abs(a-b)<.001)continue
    const alpha=b<.995?1-(1-current)*(1-a)/Math.max(1-b,1/255):current+a-b
    shown.fill(Math.round(Math.min(1,Math.max(0,alpha))*255),i,i+4)
   }
  },tick:()=>({copyTo(destination:{pixels:Uint8Array}){destination.pixels.set(shown)}})}
}}))
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import {PagedPuddleRoomController as PuddleRoomController, type PagedPuddleRoomHost as PuddleRoomHost} from './PagedPuddleRoomController'
function fixture(sourcePending?:PuddleRoomHost['sourcePending'],budget=1024*1024,width=4,height=4){
 vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{})
 const pool=new RibbonScratchPool({} as WebGLRenderingContext)
 const rehydrate=vi.fn()
 const solver={state:{done:true},resetFromScratch:vi.fn((..._args:unknown[])=>{}),step:vi.fn(),dry:()=>true,cancel:vi.fn(),destroy:vi.fn(),buffers:vi.fn(()=>({}))}
 const controller=new PuddleRoomController({createSolver:()=>solver,gl:{},size:{width,height},pool,cpuByteBudget:budget,settlePlan:{prepare(){}},rehydrate,
  render:((scratch,tile,_ctx,output)=>scratch.peek(tile.buffer)!.inkLoad!.copyTo(output)) as PuddleRoomHost['render'],changed(){},released(){},drawing:()=>false,sourcePending,display(){}} as unknown as PuddleRoomHost)
 const profile={ink:true,normalizeDeposit:true} as Parameters<typeof controller.source>[2]
 const targets=Array.from({length:8},()=>{
   const tiles=Array.from({length:3},(_,n)=>({originX:n*width,originY:n%2*height,buffer:new AccumulationBuffer({} as WebGLRenderingContext,width,height)}))
   return {allResident:()=>tiles,resolveForPaint:()=>tiles} as unknown as ILayerBuffer
 })
 function draw(i:number){
  const result=controller.source(targets[i],`g${i}`,profile,1,'',{pin:true})
  for(const [n,tile]of targets[i].allResident().slice(0,2).entries()){
   const entry=result.scratch.getOrCreate(tile.buffer)
   entry.inkLoad??=pool.acquire(width,height);entry.inkColor??=pool.acquire(width,height)
   entry.inkLoad.restorePixelsRect(width,height,new Uint8Array(width*height*4).fill(i+10+n*20))
  }
  result.scratch.noteFinish({target:targets[i],bounds:{minX:0,minY:0,maxX:width,maxY:height},fieldSeed:[0,0]} as Parameters<typeof result.scratch.noteFinish>[0])
  controller.finish(result.scratch);result.release()
  return result
 }
 return{controller,pool,profile,targets,draw,rehydrate,solver}
}
function frame(controller:InstanceType<typeof PuddleRoomController>){controller['frame'](performance.now()+1000)}
it('pending source prevents a new solve until its last canonical owner releases',()=>{
 let pending=true;const f=fixture(()=>pending)
 try{f.draw(0);frame(f.controller);frame(f.controller);expect(f.solver.resetFromScratch).not.toHaveBeenCalled();expect(f.controller.state.computations).toBe(0)
  pending=false;frame(f.controller);expect(f.solver.resetFromScratch).toHaveBeenCalledOnce();expect(f.controller.state.computations).toBe(1)
 }finally{f.controller.destroy();f.pool.trimFree();vi.unstubAllGlobals()}
})
it('pending source never prevents an already admitted solve finishing/releasing its work',()=>{
 let pending=false;const f=fixture(()=>pending);f.solver.resetFromScratch.mockImplementation(()=>{f.solver.state.done=false})
 try{f.draw(0);frame(f.controller);expect(f.solver.resetFromScratch).toHaveBeenCalledOnce();expect(f.solver.step).toHaveBeenCalledOnce()
  pending=true;f.solver.step.mockImplementation(()=>{f.solver.state.done=true});frame(f.controller)
  expect(f.solver.step).toHaveBeenCalledTimes(2);expect(f.controller['solving']).toBeNull();expect(f.solver.dry()).toBe(true);expect(f.solver.resetFromScratch).toHaveBeenCalledOnce()
 }finally{f.controller.destroy();f.pool.trimFree();vi.unstubAllGlobals()}
})
it('another independent source can be admitted while only the first one has queued material',()=>{
 let blocked:unknown;const f=fixture(scratch=>scratch===blocked)
 try{blocked=f.draw(0).scratch;f.draw(1);frame(f.controller);expect(f.solver.resetFromScratch).toHaveBeenCalledOnce();expect(f.solver.resetFromScratch.mock.calls[0][0]).not.toBe(blocked)}finally{f.controller.destroy();f.pool.trimFree();vi.unstubAllGlobals()}
})
it('default undefined callback preserves admission and a lost/destroyed controller cannot restart from stale RAF',()=>{
 const f=fixture();f.draw(0);frame(f.controller);expect(f.solver.resetFromScratch).toHaveBeenCalledOnce();f.controller.destroy();f.controller.destroy();frame(f.controller);expect(f.solver.resetFromScratch).toHaveBeenCalledOnce();f.pool.trimFree();expect(f.pool.bytes.live).toBe(0);vi.unstubAllGlobals()
})
it('cancel/destroy before admission is bounded even if the source stays pending forever',()=>{
 const f=fixture(()=>true);f.draw(0);frame(f.controller);f.controller.cancelFieldWork();f.controller.destroy();frame(f.controller);expect(f.solver.resetFromScratch).not.toHaveBeenCalled();expect(f.solver.destroy).toHaveBeenCalledOnce();f.pool.trimFree();expect(f.pool.bytes.live).toBe(0);vi.unstubAllGlobals()
})

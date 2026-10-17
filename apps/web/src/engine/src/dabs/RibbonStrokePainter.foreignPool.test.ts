import {expect,it,vi} from 'vitest'
import type {Dab} from '@grafetto/shared'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {BufferResidency} from '../buffers/BufferResidency'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {RibbonStrokeScratch} from '../buffers/RibbonStrokeScratch'
import {RibbonStrokePainter,type RibbonStrokePainterContext} from './RibbonStrokePainter'
import type {ILayerBuffer} from '../buffers/ILayerBuffer'
import type {WaterSource} from '../watercolor/foreignWater'
function fixture(){
 const gl=new MockGL() as unknown as WebGLRenderingContext,cache=new BufferResidency(gl,180)
 const globalPool=new RibbonScratchPool(gl),ownPool=new RibbonScratchPool(gl,(w,h,f)=>new AccumulationBuffer(gl,w,h,f,cache))
 const tile=new AccumulationBuffer(gl,3,3),target={allResident:()=>[{buffer:tile,originX:0,originY:0,contentRect:null}]} as unknown as ILayerBuffer
 const recipient=new RibbonStrokeScratch(ownPool,true,true);recipient.getOrCreate(tile)
 const unbind=()=>{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null)};unbind()
 const preset='normal:95:34:PB29:round:wc@m70-r2-v1',resolved={sizeMultiplier:1}
 // CPU field model only: ownership/transfer proof, not a shader pixel oracle.
 const ctx={scratchPool:()=>globalPool,resolveWaterPreset:()=>resolved,fieldOp(out:AccumulationBuffer,a:AccumulationBuffer,b:AccumulationBuffer,mode:number){
 const ap=a.readPixels(),bp=b.readPixels(),data=new Uint8Array(ap.length);for(let i=0;i<data.length;i++)data[i]=mode===20?Math.max(ap[i],bp[i]):Math.min(255,ap[i]+bp[i]);out.writePixels(data);unbind()
 }} as unknown as RibbonStrokePainterContext
 const painter=new RibbonStrokePainter(ctx)
 vi.spyOn(painter,'paintWaterSource').mockImplementation(function* (...args){const aux=args[6] as RibbonStrokeScratch,entry=aux.getOrCreate(tile);entry.coverage.writePixels(new Uint8Array(36).fill(128));entry.solventLoad=globalPool.acquire(3,3);entry.solventLoad.writePixels(new Uint8Array(36).fill(77));unbind();yield 1})
 const source:WaterSource={gesture:'foreign',footprints:[{x:1,y:1,radius:3,aspect:1,angle:0}],chunks:[{id:'chunk',preset,color:[0,0,1],dabs:[],wet:'9',seed:[0,0]}]}
 const dabs=[{x:1,y:1,size:2,aspectRatio:1,angle:0}] as Dab[]
 const run=()=>{const generator=Reflect.get(painter,'importForeignWater').call(painter,target,recipient,dabs,resolved,'9',[source]) as Generator<number>;for(const _ of generator){void _}}
 const finish=()=>{recipient.destroy();expect(ownPool.bytes.live).toBe(0);expect(globalPool.bytes.live).toBe(0);ownPool.trimFree();globalPool.trimFree();cache.dispose();tile.destroy()}
 return{gl,cache,globalPool,ownPool,tile,target,recipient,painter,run,finish,unbind}
}
it('imports foreign fluid into the recipient own cache/pool and both pools return to zero live bytes',()=>{
 const f=fixture();try{
 const ownAcquire=vi.spyOn(f.ownPool,'acquire');f.run();const foreign=f.recipient.peek(f.tile)!.foreignSolventLoad!
 expect(ownAcquire).toHaveBeenCalledTimes(1);expect(f.cache.bufferCount).toBe(5);expect(f.ownPool.bytes.live).toBe(180);expect(f.globalPool.bytes.live).toBe(0)
 expect(foreign.readPixels()).toEqual(new Uint8Array(36).fill(77));f.unbind()
 f.run();expect(ownAcquire).toHaveBeenCalledTimes(1)
 f.recipient.destroy();expect(f.ownPool.bytes.live).toBe(0);expect(f.ownPool.bytes.free).toBe(180);expect(f.globalPool.bytes.live).toBe(0)
 }finally{f.finish()}
})
it('does not publish or leak an owner lease when clear fails, and retry succeeds',()=>{
 const f=fixture();try{
 const acquire=f.ownPool.acquire.bind(f.ownPool),before=f.ownPool.bytes.live;let once=true
 const spy=vi.spyOn(f.ownPool,'acquire').mockImplementation((w,h)=>{const b=acquire(w,h);if(once){once=false;vi.spyOn(b,'clear').mockImplementationOnce(()=>{throw Error('clear fault')})}return b})
 expect(()=>f.recipient.ensureForeignSolventLoad(f.tile)).toThrow('clear fault');expect(f.recipient.peek(f.tile)!.foreignSolventLoad).toBeUndefined();expect(f.ownPool.bytes.live).toBe(before)
 const foreign=f.recipient.ensureForeignSolventLoad(f.tile);expect(foreign.readPixels()).toEqual(new Uint8Array(36));f.unbind();expect(f.ownPool.bytes.live).toBe(before+36);spy.mockRestore()
 }finally{f.finish()}
})
it('returns donor/temp leases to the global pool on recipient budget failure and can retry',()=>{
 const f=fixture();try{
 const before=f.ownPool.bytes.live,acquire=f.ownPool.acquire.bind(f.ownPool)
 const spy=vi.spyOn(f.ownPool,'acquire').mockImplementationOnce(()=>{throw Error('owner budget')})
 expect(f.run).toThrow('owner budget');expect(f.globalPool.bytes.live).toBe(0);expect(f.ownPool.bytes.live).toBe(before);expect(f.recipient.peek(f.tile)!.foreignSolventLoad).toBeUndefined()
 spy.mockImplementation(acquire);f.run();expect(f.ownPool.bytes.live).toBe(180);expect(f.globalPool.bytes.live).toBe(0);spy.mockRestore()
 }finally{f.finish()}
})

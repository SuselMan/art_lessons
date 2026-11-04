import {describe,it,expect,vi} from 'vitest'
import {withUntrackedGlClearState,captureGlClearState,invalidateGlClearState,registerGlClearState,setGlClearColor,setGlColorMask} from './GlClearState'
function fixture(){
 let color=[.25,.5,.75,1],mask=[true,false,true,false],lost=false
 const raw={COLOR_CLEAR_VALUE:1,COLOR_WRITEMASK:2,isContextLost:()=>lost,
  getParameter:vi.fn((p:number)=>p===1?new Float32Array(color):[...mask]),
  clearColor:vi.fn((r:number,g:number,b:number,a:number)=>{color=[r,g,b,a].map(Math.fround)}),
  colorMask:vi.fn((r:boolean,g:boolean,b:boolean,a:boolean)=>{mask=[r,g,b,a]})}
 const gl=raw as unknown as WebGLRenderingContext
 return {gl,raw,loss:()=>{lost=true},restore:()=>{lost=false},nativeColor:(value:number[])=>{color=[...value]},nativeMask:(value:boolean[])=>{mask=[...value]}}
}
describe('explicit owned clearColor/colorMask service',()=>{
 it('uses owned clear snapshots without repeating native readback and restores exact seeded state',()=>{
  const f=fixture(),owner=registerGlClearState(f.gl,{},()=>true);expect(f.raw.getParameter).toHaveBeenCalledTimes(2)
  const first=captureGlClearState(f.gl);for(let i=0;i<5;i++)expect(captureGlClearState(f.gl)).toEqual(first)
  expect(f.raw.getParameter).toHaveBeenCalledTimes(2)
  setGlClearColor(f.gl,0,0,0,0);setGlColorMask(f.gl,true,true,true,true)
  expect(captureGlClearState(f.gl)).toEqual({color:[0,0,0,0],mask:[true,true,true,true]})
  if(!first.color||!first.mask)throw Error('Expected genuine native seed')
  setGlClearColor(f.gl,...first.color);setGlColorMask(f.gl,...first.mask)
  expect(captureGlClearState(f.gl)).toEqual({color:[.25,.5,.75,1],mask:[true,false,true,false]})
  expect(f.raw.getParameter).toHaveBeenCalledTimes(2);expect(f.raw.clearColor).toHaveBeenCalledTimes(2);expect(f.raw.colorMask).toHaveBeenCalledTimes(2);owner.release()
 })
 it('keeps unknown contexts on full native queries and never claims raw external writes are tracked',()=>{
  const f=fixture();captureGlClearState(f.gl);f.nativeColor([.5,0,0,1]);expect(captureGlClearState(f.gl).color).toEqual([.5,0,0,1]);expect(f.raw.getParameter).toHaveBeenCalledTimes(4)
  const owner=registerGlClearState(f.gl,{},()=>true);f.raw.getParameter.mockClear();f.nativeColor([0,1,0,1]);invalidateGlClearState(f.gl)
  expect(captureGlClearState(f.gl).color).toEqual([0,1,0,1]);expect(f.raw.getParameter).toHaveBeenCalledTimes(2);owner.release()
 })
 it('returns immutable copies and does not retain mutable native-query arrays',()=>{
  const f=fixture(),nativeColor=new Float32Array([.25,.5,.75,1]),nativeMask=[true,false,true,false];f.raw.getParameter.mockImplementation(p=>p===1?nativeColor:nativeMask)
  const owner=registerGlClearState(f.gl,{},()=>true),first=captureGlClearState(f.gl);nativeColor[0]=1;nativeMask[0]=false
  expect(Reflect.set(first.color!,'0',.5)).toBe(false);expect(Reflect.set(first.mask!,'0',false)).toBe(false)
  expect(captureGlClearState(f.gl)).toEqual({color:[.25,.5,.75,1],mask:[true,false,true,false]});expect(captureGlClearState(f.gl).color).not.toBe(first.color);owner.release()
 })
 for(const value of [NaN,Infinity,-Infinity,.1,-0,-1,2])it('delegates unsafe clear argument unchanged and queries native result after '+String(value),()=>{
  const f=fixture(),owner=registerGlClearState(f.gl,{},()=>true);f.raw.getParameter.mockClear()
  f.raw.clearColor.mockImplementationOnce(()=>{f.nativeColor([.5,.25,.75,1])})
  setGlClearColor(f.gl,value,0,0,1);expect(f.raw.clearColor).toHaveBeenCalledTimes(1);expect(Object.is(f.raw.clearColor.mock.calls[0]![0],value)).toBe(true)
  expect(captureGlClearState(f.gl).color).toEqual([.5,.25,.75,1]);expect(f.raw.getParameter.mock.calls).toEqual([[f.gl.COLOR_CLEAR_VALUE]]);owner.release()
 })
 it('invalidates only a native-faulted field and preserves original thrown identity including undefined',()=>{
  const f=fixture(),owner=registerGlClearState(f.gl,{},()=>true);f.raw.getParameter.mockClear();f.raw.clearColor.mockImplementationOnce(()=>{f.nativeColor([1,0,0,1]);throw undefined})
  let caught=false;try{setGlClearColor(f.gl,0,0,0,0)}catch(error){caught=true;expect(error).toBeUndefined()}expect(caught).toBe(true)
  expect(captureGlClearState(f.gl).color).toEqual([1,0,0,1]);expect(f.raw.getParameter.mock.calls).toEqual([[f.gl.COLOR_CLEAR_VALUE]])
  f.raw.colorMask.mockImplementationOnce(()=>{f.nativeMask([false,false,false,false]);throw Error('mask native fault')})
  expect(()=>setGlColorMask(f.gl,true,true,true,true)).toThrow('mask native fault');expect(captureGlClearState(f.gl).mask).toEqual([false,false,false,false]);owner.release()
 })
 it('does not coerce colorMask arguments a second time or mirror non-boolean values',()=>{
  const f=fixture(),owner=registerGlClearState(f.gl,{},()=>true),value={valueOf:vi.fn(()=>false)};f.raw.getParameter.mockClear();f.raw.colorMask.mockImplementationOnce(()=>f.nativeMask([true,false,true,false]))
  setGlColorMask(f.gl,value as unknown as boolean,false,true,false);expect(f.raw.colorMask.mock.calls[0]![0]).toBe(value);expect(value.valueOf).not.toHaveBeenCalled();expect(captureGlClearState(f.gl).mask).toEqual([true,false,true,false]);expect(f.raw.getParameter.mock.calls).toEqual([[f.gl.COLOR_WRITEMASK]]);owner.release()
 })
 it('invalidates loss and stale generations and never lets an old release delete a newer registration',()=>{
  const f=fixture();let current=true;const old=registerGlClearState(f.gl,{},()=>current);expect(()=>registerGlClearState(f.gl,{},()=>true)).toThrow('already registered')
  current=false;f.nativeColor([1,0,0,1]);expect(captureGlClearState(f.gl).color).toEqual([1,0,0,1]);f.restore();const next=registerGlClearState(f.gl,{},()=>true);f.raw.getParameter.mockClear();old.release();setGlClearColor(f.gl,0,0,0,0);captureGlClearState(f.gl);expect(f.raw.getParameter).not.toHaveBeenCalled()
  f.loss();captureGlClearState(f.gl);f.restore();f.raw.getParameter.mockClear();captureGlClearState(f.gl);expect(f.raw.getParameter).toHaveBeenCalledTimes(2)
  next.release();const renewed=registerGlClearState(f.gl,{},()=>true);f.raw.getParameter.mockClear();captureGlClearState(f.gl);expect(f.raw.getParameter).not.toHaveBeenCalled();renewed.release()
 })
 it('fails closed if a native setter identity changes without patching any instance or prototype itself',()=>{
  const f=fixture(),owner=registerGlClearState(f.gl,{},()=>true),old=f.gl.clearColor;f.gl.clearColor=vi.fn();f.raw.getParameter.mockClear();captureGlClearState(f.gl);expect(f.raw.getParameter).toHaveBeenCalledTimes(2);expect(f.gl.clearColor).not.toBe(old);owner.release()
 })
 it('suspends reads and writes through nested foreign regions and invalidates on throw undefined',()=>{
  const f=fixture(),owner=registerGlClearState(f.gl,{},()=>true)
  try{let caught=false;try{withUntrackedGlClearState(()=>{
   f.nativeColor([1,0,0,1]);expect(captureGlClearState(f.gl).color).toEqual([1,0,0,1])
   withUntrackedGlClearState(()=>setGlClearColor(f.gl,0,1,0,1))
   f.nativeColor([0,0,1,1]);expect(captureGlClearState(f.gl).color).toEqual([0,0,1,1]);throw undefined
  })}catch(error){caught=true;expect(error).toBeUndefined()}
  expect(caught).toBe(true);f.raw.getParameter.mockClear();expect(captureGlClearState(f.gl).color).toEqual([0,0,1,1]);expect(f.raw.getParameter).toHaveBeenCalledTimes(2)
  f.raw.getParameter.mockClear();captureGlClearState(f.gl);expect(f.raw.getParameter).not.toHaveBeenCalled()
  }finally{owner.release()}
 })

})

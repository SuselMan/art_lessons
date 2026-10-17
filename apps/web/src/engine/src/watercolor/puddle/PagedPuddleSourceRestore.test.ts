import {it,expect,vi} from 'vitest'
import {restorePagedPuddleWindow,PAGED_RAW_PLANES} from './PagedPuddleSource'
function fixture(foreign=new Uint8Array(16),existing=false){
 const entry:Record<string,any>={},release=vi.fn(),acquire=vi.fn(()=>({restorePixels:vi.fn()}))
 const old={restorePixels:vi.fn()};if(existing)entry.foreignSolventLoad=old
 const scratch={peek:()=>existing?entry:null,getOrCreate:()=>entry}
 const source=Object.fromEntries(PAGED_RAW_PLANES.map((n,i)=>[n,{readRect:vi.fn(()=>n==='foreignSolventLoad'?foreign:new Uint8Array(16).fill(i+1))}]))
 const run=(opt=false)=>restorePagedPuddleWindow(source as any,{x:0,y:0,width:2,height:2},scratch as any,{width:2,height:2} as any,{acquire,release} as any,{omitZeroForeignSolventLoad:opt})
 return{entry,source,acquire,run,old}
}
it('default restores all six planes including zero foreign',()=>{const f=fixture();f.run();expect(f.acquire).toHaveBeenCalledTimes(6);expect(f.entry.foreignSolventLoad.restorePixels).toHaveBeenCalledWith(new Uint8Array(16))})
it('opt-in omits only fresh exactly-zero foreign; all other raw bytes remain exact',()=>{const f=fixture();f.run(true);expect(f.acquire).toHaveBeenCalledTimes(5);expect(f.entry.foreignSolventLoad).toBeUndefined();for(const n of PAGED_RAW_PLANES.slice(0,5))expect(f.entry[n].restorePixels).toHaveBeenCalledWith(f.source[n].readRect.mock.results[0].value);expect(f.entry.solventLoad).toBeDefined()})
for(const channel of [0,1,2,3,15])it(`retains foreign nonzero byte ${channel} even with zero alpha`,()=>{const bytes=new Uint8Array(16);bytes[channel]=1;const f=fixture(bytes);f.run(true);expect(f.acquire).toHaveBeenCalledTimes(6);expect(f.entry.foreignSolventLoad.restorePixels).toHaveBeenCalledWith(bytes)})
it('existing owned foreign plane is overwritten with zero, never abandoned',()=>{const f=fixture(undefined,true);f.run(true);expect(f.entry.foreignSolventLoad).toBe(f.old);expect(f.old.restorePixels).toHaveBeenCalledWith(new Uint8Array(16));expect(f.acquire).toHaveBeenCalledTimes(5)})

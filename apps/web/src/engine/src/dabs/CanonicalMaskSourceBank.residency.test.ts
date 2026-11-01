import {expect,it,vi} from 'vitest'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
const companion={gpuBytes:0,cpuBytes:0}
function fixture(){const{gl}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache();return{gl,cache,cpu,bank:new CanonicalMaskSourceBank(gl,cache,cpu,[],companion,undefined,'root-residency')}}
function source(letter:string){return{asset:{id:'asset:'+letter.repeat(64),size:8,x:0,y:0,width:8,height:8},readOriginalCoverage:vi.fn(()=>Uint8Array.from({length:64},(_,i)=>i*3))}}
function prepare(s:ReturnType<typeof fixture>,a=source('a')){const p=s.bank.prepareRoot([a],companion,[{asset:a.asset,indexes:[0,1]}]);p.jobs.forEach((_,i)=>p.prepareJob(i));p.assertPreparedPublication();return p.publish()}
it('keeps OPEN subset stable while finished roots release rows, readers and CPU ownership',()=>{
 const s=fixture(),a=source('a'),b=source('b');try{const open=prepare(s,a),before=open.resources(),baseline=s.cpu.reservedBytes,done=prepare(s,b)
 expect(s.bank.jobs).toHaveLength(4);expect(open.resources()).toEqual(before);expect(done.resources()).toHaveLength(2)
 done.release();expect(s.bank.jobs).toHaveLength(2);expect(s.cpu.reservedBytes).toBe(baseline);expect(open.resources()).toEqual(before)
 expect(()=>done.resources()).toThrow();open.release();expect(s.bank.jobs).toHaveLength(0)
 }finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('shares native keys without changing readers and releases the last root independently of root order',()=>{
 const s=fixture(),a=source('a');try{const first=prepare(s,a),calls=a.readOriginalCoverage.mock.calls.length,second=prepare(s,{...a,readOriginalCoverage:vi.fn(()=>{throw Error('old reader must win')})})
 expect(s.bank.jobs).toHaveLength(2);expect(a.readOriginalCoverage).toHaveBeenCalledTimes(calls);first.release();expect(second.isReady()).toBe(true);expect(s.bank.jobs).toHaveLength(2);second.release();expect(s.bank.jobs).toHaveLength(0)
 }finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('cancels a pending root without invalidating OPEN and reset retires all memberships including stale releases',()=>{
 const s=fixture();const open=prepare(s),old=open.resources(),baseline=s.cpu.reservedBytes,p=s.bank.prepareRoot([source('b')],companion)
 p.prepareJob(0);p.cancel();expect(open.resources()).toEqual(old);expect(s.cpu.reservedBytes).toBe(baseline)
 const second=prepare(s,source('b'));s.bank.reset();expect(()=>open.resources()).toThrow();open.release();second.release();p.cancel();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('does not require unrelated missing cache levels and rejects publication before the exact subset is ready',()=>{
 const s=fixture();try{const open=prepare(s),p=s.bank.prepareRoot([source('b')],companion,[{asset:source('b').asset,indexes:[0]}]);expect(()=>p.publish()).toThrow();expect(open.isReady()).toBe(true);p.cancel();open.release()
 }finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('reclaims more than seventy finished roots while one OPEN root keeps its exact native textures',()=>{
 const s=fixture();try{const open=prepare(s),before=open.resources(),baseline=s.cpu.reservedBytes
 for(let i=0;i<75;i++){const a=source('b');a.asset.id='asset:'+i.toString(16).padStart(64,'0');const done=prepare(s,a);done.release();expect(s.bank.jobs).toHaveLength(2);expect(s.cpu.reservedBytes).toBe(baseline)}
 expect(open.resources()).toEqual(before);open.release()
 }finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('does not resurrect released rows when an unrelated OPEN root retires during preparation',()=>{
 const s=fixture();try{const open=prepare(s),p=s.bank.prepareRoot([source('b')],companion,[{asset:source('b').asset,indexes:[0]}]);open.release();p.prepareJob(0);p.assertPreparedPublication();const lease=p.publish();expect(s.bank.jobs).toHaveLength(1);expect(lease.resources()).toHaveLength(1);lease.release()
 }finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rolls back publication budget, read failure and loss without changing the old OPEN root',()=>{
 const s=fixture();try{const open=prepare(s),before=open.resources(),baseline=s.cpu.reservedBytes
 expect(()=>s.bank.prepareRoot([source('b')],{gpuBytes:s.cache.budgetBytes,cpuBytes:0})).toThrow();expect(s.cpu.reservedBytes).toBe(baseline)
 const bad={...source('b'),readOriginalCoverage:()=>{throw Error('CAS read failed')}},p=s.bank.prepareRoot([bad],companion,[{asset:bad.asset,indexes:[0]}]);expect(()=>p.prepareJob(0)).toThrow('CAS read failed');p.cancel();expect(s.cpu.reservedBytes).toBe(baseline);expect(open.resources()).toEqual(before)
 const deletes=s.gl.deleteTexture.mock.calls.length;s.gl.isContextLost=()=>true;s.bank.reset(true);open.release(true);expect(s.gl.deleteTexture).toHaveBeenCalledTimes(deletes)
 }finally{s.bank.reset(true);s.cache.clear(true)}expect(s.cpu.reservedBytes).toBe(0)
})
it('admits one tiny root under a small existing CPU budget rather than reserving the whole job ceiling',()=>{
 const{gl}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache(96*1024),bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],companion,undefined,'root-residency'),a=source('a')
 try{const p=bank.prepareRoot([a],companion,[{asset:a.asset,indexes:[7]}]);p.prepareJob(0);p.assertPreparedPublication();const root=p.publish();expect(root.resources()).toHaveLength(1);root.release();expect(bank.jobs).toHaveLength(0)}finally{bank.reset();cache.clear()}expect(cpu.reservedBytes).toBe(0)
})
it('revalidates owner state after planning-reservation callbacks and leaves no extra CPU reservation',()=>{
 const s=fixture(),original=s.cpu.reserve.bind(s.cpu);let once=true
 vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{const release=original(bytes);if(once){once=false;s.bank.reset()}return release})
 expect(()=>s.bank.prepareRoot([source('a')],companion)).toThrow();expect(s.cpu.reservedBytes).toBe(0);s.bank.reset();s.cache.clear()
})
it('rejects unowned getters and missing requested native levels without evaluating their accessors',()=>{
 const s=fixture(),a=source('a'),get=vi.fn(()=>a.asset),bad=Object.defineProperty({...a},'asset',{get,enumerable:true})
 try{expect(()=>s.bank.prepareRoot([bad],companion)).toThrow();expect(get).not.toHaveBeenCalled();const root=prepare(s,a);expect(()=>root.assertRequiredSourceBinding(a.asset,[7],s)).toThrow();root.release()}finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('cancels a reader-reentrant preparation without uploading or leaking its reservations',()=>{
 const s=fixture(),a=source('a');let p:ReturnType<CanonicalMaskSourceBank['prepareRoot']>
 a.readOriginalCoverage=vi.fn(()=>{p.cancel();return new Uint8Array(64)})
 try{p=s.bank.prepareRoot([a],companion);expect(p.prepareJob(0)).toBe('cancelled');expect(p.status).toBe('cancelled');expect(s.bank.jobs).toHaveLength(0);expect(s.cpu.reservedBytes).toBe(512)}finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects nested jobs at the same source boundary while preserving the outer preparation',()=>{
 const s=fixture(),a=source('a');let p:ReturnType<CanonicalMaskSourceBank['prepareRoot']>
 a.readOriginalCoverage=vi.fn(()=>{expect(()=>p.prepareJob(0)).toThrow('reentered');return new Uint8Array(64)})
 try{p=s.bank.prepareRoot([a],companion,[{asset:a.asset,indexes:[0]}]);expect(p.prepareJob(0)).toBe('ready');p.assertPreparedPublication();p.publish().release()}finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('keeps a published root owned by its consumer when pending-work cancellation arrives late',()=>{
 const s=fixture();try{const a=source('a'),p=s.bank.prepareRoot([a],companion,[{asset:a.asset,indexes:[0]}]);p.prepareJob(0);p.assertPreparedPublication();const root=p.publish();p.cancel();expect(root.isReady()).toBe(true);expect(s.bank.jobs).toHaveLength(1);root.release()}finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('requires restaging after a root retires between prepared-publication validation and publish',()=>{
 const s=fixture();try{const open=prepare(s),a=source('b'),p=s.bank.prepareRoot([a],companion,[{asset:a.asset,indexes:[0]}]);p.prepareJob(0);p.assertPreparedPublication();open.release();expect(()=>p.publish()).toThrow('Validate current');p.assertPreparedPublication();const root=p.publish();expect(s.bank.jobs).toHaveLength(1);root.release()}finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('forks resource-only per-gesture handles while selected preparation and OPEN children remain independent',()=>{
 const s=fixture();try{const selected=prepare(s),baseline=s.cpu.reservedBytes,queries=vi.spyOn(s.gl,'getParameter'),gets=vi.spyOn(s.cache,'get'),child=selected.retain()
 expect(gets).not.toHaveBeenCalled();expect(queries).not.toHaveBeenCalled();child.release();expect(s.cpu.reservedBytes).toBe(baseline);expect(selected.isReady()).toBe(true)
 const open=selected.retain(),before=open.resources();selected.release();expect(()=>selected.resources()).toThrow();expect(open.resources()).toEqual(before);expect(s.bank.jobs).toHaveLength(2);open.release();expect(s.bank.jobs).toHaveLength(0)
 }finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('resets every retained child even if its selected parent was already released',()=>{
 const s=fixture(),selected=prepare(s),first=selected.retain(),second=first.retain();selected.release();s.bank.reset();expect(s.cpu.reservedBytes).toBe(0);expect(()=>first.isReady()).toThrow();first.release();second.release();s.cache.clear()
})
it('rolls back a child charge if its parent retires during the CPU reservation callback',()=>{
 const s=fixture(),selected=prepare(s),reserve=s.cpu.reserve.bind(s.cpu);vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{const release=reserve(bytes);selected.release();return release})
 expect(()=>selected.retain()).toThrow();s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('detects child membership changes even when the active native job array and child count remain the same',()=>{
 const s=fixture();try{const selected=prepare(s),child=selected.retain(),a=source('a'),p=s.bank.prepareRoot([a],companion,[{asset:a.asset,indexes:[0,1]}]);p.jobs.forEach((_,i)=>p.prepareJob(i));p.assertPreparedPublication();child.release();const replacement=selected.retain();expect(()=>p.publish()).toThrow('memberships changed');p.assertPreparedPublication();const next=p.publish();p.finalizeCleanup();next.release();replacement.release();selected.release()}finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('uploads exactly the old full-bank RGBA bytes at the selected original native indexes',()=>{
 const s=fixture(),a=source('a'),images=new Map<unknown,Uint8Array>(),upload=s.gl.texImage2D
 s.gl.texImage2D=(...args:unknown[])=>{images.set(s.gl.getParameter(s.gl.TEXTURE_BINDING_2D),new Uint8Array(args[8] as Uint8Array));upload(...args)}
 const full=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[a],companion),expected=new Map<string,Uint8Array>()
 try{full.jobs.forEach((job,i)=>{full.prepareJob(i);expected.set(job.key,images.get(s.cache.get(job.key))!)});full.reset();const root=prepare(s,a)
 for(const resource of root.resources())expect(images.get(resource.texture)).toEqual(expected.get(resource.key))
 expect(root.preparedResources().map(item=>item.canonical?.index)).toEqual([0,1]);root.release()
 }finally{full.reset();s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('preserves the original planning error when releasing its planning reservation also throws',()=>{
 const s=fixture(),primary=new Error('original planning failure'),cleanup=new Error('planning cleanup failure'),reserve=s.cpu.reserve.bind(s.cpu),a=source('a')
 vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{const release=reserve(bytes);return()=>{release();throw cleanup}})
 const malformed=new Proxy(a,{ownKeys(){throw primary}})
 expect(()=>s.bank.prepareRoot([malformed],companion)).toThrow(primary);s.bank.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects combined foreign-cache pin pressure before adoption and rolls back all candidate CPU ownership',()=>{
 const s=fixture(),a=source('a'),other=s.cache.leaseRequired([{key:'other-existing-owner',bytes:s.cache.budgetBytes-16}]),baseline=s.cpu.reservedBytes
 try{expect(()=>s.bank.prepareRoot([a],companion,[{asset:a.asset,indexes:[0]}])).toThrow();expect(s.cpu.reservedBytes).toBe(baseline);expect(s.bank.jobs).toHaveLength(0);expect(a.readOriginalCoverage).not.toHaveBeenCalled()}finally{other();s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})
it('fails a child CPU reservation without changing its prepared parent or source rows',()=>{
 const s=fixture();try{const parent=prepare(s),baseline=s.cpu.reservedBytes,held=s.cpu.reserve(s.cpu.budgetBytes-baseline)
 expect(()=>parent.retain()).toThrow();expect(parent.isReady()).toBe(true);expect(s.bank.jobs).toHaveLength(2);held();const child=parent.retain();child.release();expect(s.cpu.reservedBytes).toBe(baseline);parent.release()}finally{s.bank.reset();s.cache.clear()}expect(s.cpu.reservedBytes).toBe(0)
})

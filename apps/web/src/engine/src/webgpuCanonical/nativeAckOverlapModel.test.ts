import {expect,it} from 'vitest'
import {CanonicalRoomWatercolorExecutor} from './roomWatercolorExecutor'
/** CPU command-order proposal. Values are sentinel versions, not watercolor pixels.
 * Actual Executor methods are used; fake central.isIdle explicitly models a
 * hypothetical owner-local lane. Production FIFO is not changed or bypassed. */
function fixture(){
 const encoded:Array<{label:string;execute:()=>void}>=[],trace:string[]=[],field={value:0},gl={value:0,version:0},views:Array<{value:number;version:number;retired:boolean;release:()=>void}>=[]
 const enqueue=(label:string,execute:()=>void)=>{trace.push('encode:'+label);encoded.push({label,execute})}
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 const scratch={gesture:1,materialGesture:1,tiles:{},paints:new Set(),delivery:{},captureMetadata:()=>({}),activateMaterialFilm:()=>{}}
 const adapter={runQuantum:(cb:(ctx:any)=>any)=>cb({encoder:{}}),retain:()=>{},retireStaticFrontCache:()=>{}}
 const bridge={copyByCanvas:async(_field:unknown,_target:unknown,current:()=>boolean)=>{
  let release!:()=>void;const ack=new Promise<void>(r=>{release=r}),view={value:-1,version:views.length+1,retired:false,release};views.push(view)
  enqueue('privatePublication:'+view.version,()=>{view.value=field.value})
  await ack
  if(!current()||view.retired||view.version<gl.version)throw Error('Publication lease stale')
  gl.value=view.value;gl.version=view.version;trace.push('GLimport:'+view.version)
 }}
 Object.assign(owner,{retired:false,diagnosticSourceOwnershipAssertions:false,diagnosticPublication:false,backend:{},central:{isIdle:true},layerId:'L',generation:1,target:{buffer:{field}},glTile:gl,bridgeMode:'canvas',bridge,adapter,scratch,accepted:new Set(),planner:{prepare:()=>({ops:[],compositeDomain:{},finish:()=>{},dispose:()=>{}})},finish:{encode:()=>{enqueue('oldFinish',()=>{field.value=1});return[]},encodeLive:()=>[]},source:{execute:()=>{enqueue('newSource',()=>{field.value=2});return[]}}})
 const chunk={path:'live',layerId:'L',generation:1,strokeId:'next',ordinal:1,materialGesture:2,segment:{},live:{},metadata:{gesture:2,paints:new Set(),brushTravel:[],wetContacts:[],foreignSources:null,dryCtx:null}}
 return{owner,field,gl,views,trace,chunk,flush(){while(encoded.length){const command=encoded.shift()!;trace.push('GPU:'+command.label);command.execute()}}}
}
it('actual finish/source order plus private publication view preserves old snapshot while next source executes',async()=>{
 const f=fixture(),job=f.owner.prepareSettle({bounds:{}} as any)!
 expect(job.step()).toBe(true);job.finish();const old=job.publish!()
 f.owner.emitPrepared(f.chunk as any);f.flush()
 expect(f.trace).toEqual(['encode:oldFinish','encode:privatePublication:1','encode:newSource','GPU:oldFinish','GPU:privatePublication:1','GPU:newSource'])
 expect(f.field.value).toBe(2);expect(f.views[0].value).toBe(1);expect(f.gl.value).toBe(0)
 f.views[0].release();await old;expect(f.gl.value).toBe(1);job.dispose()
})
it('publication version rejects late old import; retirement invalidates the private view lease',async()=>{
 const f=fixture(),job=f.owner.prepareSettle({bounds:{}} as any)!;job.step();job.finish();const old=job.publish!(),rejected=expect(old).rejects.toThrow('lease stale')
 f.owner.emitPrepared(f.chunk as any);const next=f.owner.publishCurrentToGl();f.flush();f.views[1].release();await next
 expect(f.gl.value).toBe(2);f.views[0].release();await rejected;expect(f.gl.value).toBe(2)
 const g=fixture(),held=g.owner.publishCurrentToGl(),retired=expect(held).rejects.toThrow('lease stale');g.flush();g.views[0].retired=true;g.views[0].release();await retired;expect(g.gl.version).toBe(0);job.dispose()
 const h=fixture(),ownerHeld=h.owner.publishCurrentToGl(),ownerRejected=expect(ownerHeld).rejects.toThrow('lease stale');h.flush();(h.owner as any).retired=true;h.views[0].release();await ownerRejected;expect(h.gl.version).toBe(0)
})
it('new-owner seed from unpublished GL is rejected by the proposal baseline contract',()=>{
 const f=fixture(),job=f.owner.prepareSettle({bounds:{}} as any)!;job.step();job.finish();f.flush()
 const seedNewOwnerFromGl=()=>{if(f.gl.value!==f.field.value)throw Error('New owner GL baseline unpublished');return f.gl.value}
 expect(f.field.value).toBe(1);expect(f.gl.value).toBe(0);expect(seedNewOwnerFromGl).toThrow('baseline unpublished')
 // This model does not provide a native baseline lease or a COW implementation.
 expect((f.owner as any).diagnosticSourceOwnershipAssertions).toBe(false);job.dispose()
})

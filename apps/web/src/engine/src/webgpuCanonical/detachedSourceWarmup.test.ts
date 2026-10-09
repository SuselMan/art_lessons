import {it,expect,vi,beforeEach} from 'vitest'
import type {PreparedSourceSegment} from './sourcePhaseExecutor'
const state=vi.hoisted(()=>({failEncode:false,buffersDestroyed:0}))
vi.mock('./fieldBuffer',()=>({CanonicalFieldBuffer:class{
 field;owner;width;height
 constructor(owner:never,width:number,height:number,filter='nearest',label='test'){this.owner=owner;this.width=width;this.height=height;this.field=(owner as {createField:Function}).createField(label,width,height,filter)}
 clear(){(this.owner as {clearField:Function}).clearField(this.field)}
 destroy(){(this.owner as {destroyField:Function}).destroyField(this.field)}
},CanonicalScratchPool:class{owner;constructor(owner:never){this.owner=owner}destroy(){}}}))
vi.mock('./tileScratch',()=>({CanonicalTileScratch:class{pool;constructor(pool:never){this.pool=pool}destroy(){}}}))
vi.mock('./passes/fieldOps',()=>({CanonicalFieldOps:class{run(){return {destroy(){state.buffersDestroyed++}}}}}))
vi.mock('./sourcePhaseExecutor',()=>({CanonicalSourcePhaseExecutor:class{
 owner;constructor(owner:never){this.owner=owner}
 execute(){(this.owner as {createField:Function}).createField('detached source scratch',1024,1024,'nearest');if(state.failEncode)throw Error('source encoding failed');return[{size:256,destroy(){state.buffersDestroyed++}}]}
}}))
import {warmDetachedPreparedSource} from './detachedSourceWarmup'
function backend(){
 const fields=new Set<{label:string;width:number;height:number;filter:string;format:string}>(),destroyed:unknown[]=[],journal=[{seed:88}],history=[1]
 let submitted=0
 const b={options:{roomOwnedResources:true},device:{pushErrorScope(){},async popErrorScope(){return null},createCommandEncoder(){return{finish(){return {}}}},queue:{submit(){submitted++}}},nearest:{},linear:{},paper:{},noise:{},
 createField(label:string,width:number,height:number,filter:string){const f={label,width,height,filter,format:'rgba8unorm'};fields.add(f);return f},destroyField(f:never){fields.delete(f);destroyed.push(f)},clearField(){},async whenIdle(){},encodeOwnerCommands(_e:unknown,task:()=>unknown){return{value:task(),release(){}}},get diagnosticResourceLedger(){return[...fields].map(f=>({...f,bytes:f.width*f.height*4}))}}
 return {b,fields,destroyed,journal,history,get submitted(){return submitted}}
}
beforeEach(()=>{state.failEncode=false;state.buffersDestroyed=0})
const packet:PreparedSourceSegment={commands:[{kind:'stamp',phase:'coverage'}] as unknown as PreparedSourceSegment['commands'],rect:[0,0,8,8],film:true,waterOnly:true}
it('detached source retires own fields and leaves history/input untouched',async()=>{
 const m=backend(),before=JSON.stringify(packet),r=await warmDetachedPreparedSource(m.b as never,packet)
 expect(r.sourceSha256).toHaveLength(64);expect(r.sharedResourceDeltaBytes).toBe(0);expect(m.submitted).toBe(1);expect(m.fields.size).toBe(0);expect(m.destroyed).toHaveLength(2);expect(state.buffersDestroyed).toBe(1);expect(JSON.stringify(packet)).toBe(before);expect(m.journal).toEqual([{seed:88}]);expect(m.history).toEqual([1])
})
it('partial source encoding failure cleans all allocated fields without submitting',async()=>{
 const m=backend();state.failEncode=true
 await expect(warmDetachedPreparedSource(m.b as never,packet)).rejects.toThrow('source encoding failed');expect(m.fields.size).toBe(0);expect(m.destroyed).toHaveLength(2);expect(m.submitted).toBe(0)
})
it('empty packet rejects before field allocation',async()=>{
 const m=backend();await expect(warmDetachedPreparedSource(m.b as never,{...packet,commands:[]})).rejects.toThrow('packet');expect(m.fields.size).toBe(0);expect(m.destroyed).toHaveLength(0)
})

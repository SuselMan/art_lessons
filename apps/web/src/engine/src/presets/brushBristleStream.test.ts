import {expect,it} from 'vitest'
import {advanceBristleStreamPass,beginBristleStreamPass,commitBristleStreamRequest,completeBristleStreamPass,createBristleStreamRequest,type BristleStreamLine,type BristleStreamRequest} from './brushBristleStream'
import {createBristleInkProfile,createBristleInkState} from './brushBristleInk'
const profile=createBristleInkProfile({depletion:[0,.25,.5,1],useOpacity:true,useSaturation:true,useWeights:false,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50})
const line=(hair:number,x:number,distance:number):BristleStreamLine=>({geometry:{hair,start:[x,-1.25],end:[x+distance,3.75],length:.75,pressure:1.2},color:[1,.2,0],flow:1,ceiling:.5})
function pass(request:BristleStreamRequest,limit:number){
 const cursor=beginBristleStreamPass(request),samples=[]
 for(;;){const step=advanceBristleStreamPass(profile,request,cursor,true,limit);samples.push(...step.samples);if(step.done)break}
 completeBristleStreamPass(request,cursor);return {cursor,samples}
}
it('replays each tile from immutable request-start ink and commits to gesture exactly once',()=>{
 const live=createBristleInkState(2),initial=structuredClone(live),request=createBristleStreamRequest(live,[line(0,-5,100),line(1,10000,33)],7)
 const first=pass(request,17),second=pass(request,2048)
 expect(second.samples).toEqual(first.samples);expect(live).toEqual(initial);expect(first.cursor.state.hairs[1].counter).toBeGreaterThan(0)
 expect(commitBristleStreamRequest(request,live)).toBe(true);expect(live).toEqual(first.cursor.state);expect(commitBristleStreamRequest(request,live)).toBe(false)
})
it('bounds a huge source trajectory without expanding it into a whole-line array',()=>{
 const live=createBristleInkState(1),request=createBristleStreamRequest(live,[line(0,0,100000000)],1),cursor=beginBristleStreamPass(request)
 const chunk=advanceBristleStreamPass(profile,request,cursor,false,2048)
 expect(chunk.samples).toHaveLength(2048);expect(chunk.done).toBe(false);expect(cursor.state.hairs[0].counter).toBe(2048);expect(live.hairs[0].counter).toBe(0);expect(request.lines).toHaveLength(1)
 expect(()=>completeBristleStreamPass(request,cursor)).toThrow('Incomplete');expect(()=>commitBristleStreamRequest(request,live)).toThrow('no completed')
})
it('clones the active line cursor and continues exact colors/counters independently of packet-sized chunks',()=>{
 const request=createBristleStreamRequest(createBristleInkState(2),[line(0,-4,120),line(1,55,30)],3),a=beginBristleStreamPass(request)
 advanceBristleStreamPass(profile,request,a,true,3);const b=structuredClone(a),tailA=[],tailB=[]
 for(;;){const step=advanceBristleStreamPass(profile,request,a,true,2);tailA.push(...step.samples);if(step.done)break}
 for(;;){const step=advanceBristleStreamPass(profile,request,b,true,2048);tailB.push(...step.samples);if(step.done)break}
 expect(tailB).toEqual(tailA);expect(b).toEqual(a)
})
it('refuses a changed tile replay and out-of-order gesture commit',()=>{
 const live=createBristleInkState(1),request=createBristleStreamRequest(live,[line(0,0,5)],2);pass(request,2)
 const other=beginBristleStreamPass(request);while(!advanceBristleStreamPass(profile,request,other,true).done){};other.state.hairs[0].counter++
 expect(()=>completeBristleStreamPass(request,other)).toThrow('changed')
 live.hairs[0].counter++;expect(()=>commitBristleStreamRequest(request,live)).toThrow('advanced')
})
it('captures actual line data rather than retaining caller-mutated geometry and leaves uncontacted hairs untouched',()=>{
 const live=createBristleInkState(3),mutable=line(1,0,10),request=createBristleStreamRequest(live,[mutable],0)
 mutable.geometry.hair=2;mutable.geometry.length=.1
 const out=pass(request,2048);expect(out.cursor.state.hairs[0].counter).toBe(0);expect(out.cursor.state.hairs[2].counter).toBe(0);expect(out.cursor.state.hairs[1].counter).toBeGreaterThan(0)
 expect(()=>createBristleStreamRequest(live,[line(1,0,2),line(1,0,3)],1)).toThrow('hair')
})
it('rejects sample ordinal exhaustion before mutating the current hair or cursor',()=>{
 const request=createBristleStreamRequest(createBristleInkState(1),[line(0,0,5)],0),cursor=beginBristleStreamPass(request);cursor.sampleOrdinal=Number.MAX_SAFE_INTEGER-1
 const before=structuredClone(cursor)
 expect(()=>advanceBristleStreamPass(profile,request,cursor,true,2048)).toThrow('exhausted');expect(cursor).toEqual(before)
})

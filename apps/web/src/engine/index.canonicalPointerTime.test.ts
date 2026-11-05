import {expect,it} from 'vitest'
import {PencilEngine} from './index'
function fixture(start=331809.3000000715){
 const session={lastTime:0,source:{timestamp:start,prepared:{}}}
 const engine=Object.create(PencilEngine.prototype) as {
  _assertCanonicalTiltInput:()=>void
  _canonicalAirbrushSample:(_s:unknown,input:{pressure:number;x:number})=>{pressure:number;x:number}
  _canonicalPacket:(_s:typeof session,input:{timeStamp:number;pressure:number;x:number})=>{t:number;pressure:number;x:number}
 }
 engine._assertCanonicalTiltInput=()=>{}
 engine._canonicalAirbrushSample=(_s,input)=>({pressure:input.pressure,x:input.x})
 const packet=(timeStamp:number,pressure=.5,x=12)=>engine._canonicalPacket(session,{timeStamp,pressure,x})
 return{session,packet}
}
it('accepts the actual Samsung coalesced sample 0.2ms before DOWN without losing position or pressure',()=>{
 const {packet,session}=fixture();expect(packet(331809.10000002384,.21269842982292175,37)).toEqual({t:0,pressure:.21269842982292175,x:37});expect(session.lastTime).toBe(0)
})
it('retains overlapping samples in dispatch order at nondecreasing logical times',()=>{
 const {packet}=fixture(100);expect([packet(100),packet(104.8),packet(103,.2,22),packet(107.2)].map(p=>p.t)).toEqual([0,4,4,7])
})
it('keeps the original event-relative floor for ordinary increasing samples',()=>{
 const {packet}=fixture(100);expect([100,101.9,125.3,400].map(t=>packet(t).t)).toEqual([0,1,25,300])
})
it.each([NaN,Infinity,-Infinity])('still rejects nonfinite native time %s without changing the accepted clock',time=>{
 const {packet,session}=fixture(100);packet(110);expect(()=>packet(time)).toThrow('Invalid canonical pointer timestamp');expect(session.lastTime).toBe(10)
})

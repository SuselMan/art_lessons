import {it,expect} from 'vitest'
import {cloneWarmPacket,serializeWarmPacket,warmPacketSha256} from './warmPacket'
import type {PreparedSourceSegment} from './sourcePhaseExecutor'
it('hashes exact Float32 bits and detached clone cannot mutate source',async()=>{
 const p={commands:[{kind:'ribbon',batch:{vertices:new Float32Array([0,-0,.1])}}],rect:[0,0,8,8],film:true,waterOnly:false} as unknown as PreparedSourceSegment
 const clone=cloneWarmPacket(p),before=await warmPacketSha256(p)
 expect(serializeWarmPacket(clone)).toBe(serializeWarmPacket(p));expect(before).toHaveLength(64)
 if(clone.commands[0].kind==='ribbon')clone.commands[0].batch.vertices[1]=0
 expect(await warmPacketSha256(clone)).not.toBe(before);expect(await warmPacketSha256(p)).toBe(before)
})
it('rejects nonfinite scalar metadata',()=>{expect(()=>serializeWarmPacket({commands:[],rect:[0,0,NaN,1],film:false,waterOnly:true})).toThrow('Nonfinite')})
it('preserves preexisting resource records and permits only shared zero4bytes',async()=>{
 const {assertWarmResourceRetirement:f}=await import('./warmPacket'),paper={id:1,label:'paper',width:2,height:2,filter:'linear',format:'rgba8unorm',bytes:16} as const,zero={id:20,label:'constant zero source water',width:1,height:1,filter:'nearest',format:'rgba8unorm',bytes:4} as const
 expect(f([paper],[paper])).toBe(0);expect(f([paper],[paper,zero])).toBe(4)
 expect(()=>f([paper],[{...paper,id:21}])).toThrow('preexisting');expect(()=>f([paper],[zero])).toThrow('preexisting');expect(()=>f([paper],[paper,{...zero,label:'leak'}])).toThrow('unexpected')
})

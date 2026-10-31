import {expect,it,vi} from 'vitest'
import type {JoinGateDeps} from './useJoinGate'
vi.mock('react',()=>({useState:(initial:unknown)=>[initial,vi.fn()],useRef:(value:unknown)=>({current:value}),useCallback:(callback:unknown)=>callback}))
vi.mock('../../i18n',()=>({useT:()=>((key:string)=>key)}))
import {useJoinGate} from './useJoinGate'
it('uses the same socket-owned typed join wrapper and does not publish joined identity before ACK',()=>{
 const emit=vi.fn(),join=vi.fn<import('@grafetto/shared').ClientToServerEvents['join_room']>(),identity=vi.fn(),resend=vi.fn(),joined={current:false}
 const deps:JoinGateDeps={id:'B',myDisplayName:'Ann',socketRef:{current:{emit} as unknown as NonNullable<JoinGateDeps['socketRef']['current']>},latestKnownSeqRef:{current:3},lastJoinAttemptRef:{current:null},hasJoinedRef:joined,applyIdentity:identity,outbox:{resendAll:resend},startOpenTimer:vi.fn(),joinRoomRef:{current:join}}
 useJoinGate(deps).retryJoin()
 expect(join).toHaveBeenCalledOnce();expect(join.mock.calls[0][0]).toMatchObject({roomId:'B',name:'Ann',lastKnownSeq:3})
 expect(emit).not.toHaveBeenCalled();expect(identity).not.toHaveBeenCalled();expect(joined.current).toBe(false)
 join.mock.calls[0][1]({ok:true,userId:'U'})
 expect(identity).toHaveBeenCalledWith('U');expect(joined.current).toBe(true);expect(resend).toHaveBeenCalledOnce()
})
it('does not bypass an unavailable published wrapper with a raw socket emit',()=>{
 const emit=vi.fn(),start=vi.fn()
 const deps:JoinGateDeps={id:'B',myDisplayName:'Ann',socketRef:{current:{emit} as unknown as NonNullable<JoinGateDeps['socketRef']['current']>},latestKnownSeqRef:{current:0},lastJoinAttemptRef:{current:null},hasJoinedRef:{current:false},applyIdentity:vi.fn(),outbox:{resendAll:vi.fn()},startOpenTimer:start,joinRoomRef:{current:null}}
 useJoinGate(deps).retryJoin();expect(emit).not.toHaveBeenCalled()
})

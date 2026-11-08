import{expect,it,vi}from'vitest'
import{PencilEngine}from'./index'
const retire=PencilEngine.prototype['_retireStagedBeginScratch']
it('actual cancellation retires committed but untransferred palette scratch before FIFO cancellation, including queued next author',()=>{
 const a={destroy:vi.fn(),forget:vi.fn()},b={destroy:vi.fn(),forget:vi.fn()},candidate={committed:true,capability:'bristleSoak139',scratch:a},next={committed:false,capability:'bristleSoak139',scratch:b},stop={}
 const host={_gridAuthor:candidate,_gridNextAuthor:next,_strokeId:null,_ribbonStrokeScratch:null,_authorSnapshot:undefined,_authorProducer:undefined,_stopAirbrush:vi.fn(),_authorInput:{pending:true,cancel:()=>{throw stop}},_authorTasks:{reset:vi.fn()},_retireStagedBeginScratch:retire,_cancelGridAuthorStart:vi.fn()}
 try{Reflect.apply(PencilEngine.prototype['_cancelOwnedAuthor'],host,[false]);throw Error('missing cancellation boundary')}catch(error){expect(error).toBe(stop)}
 expect(a.destroy).toHaveBeenCalledTimes(1);expect(b.destroy).toHaveBeenCalledTimes(1);expect(candidate.scratch).toBeUndefined();expect(next.scratch).toBeUndefined()
})
it('successful SAME-owner transfer is not double-freed; loss forgets only untransferred staged scratch',()=>{
 const live={destroy:vi.fn(),forget:vi.fn()},staged={destroy:vi.fn(),forget:vi.fn()},candidate={scratch:live},other={scratch:staged}
 Reflect.apply(retire,{_ribbonStrokeScratch:live},[candidate,false]);expect(candidate.scratch).toBeUndefined();expect(live.destroy).not.toHaveBeenCalled();expect(live.forget).not.toHaveBeenCalled()
 Reflect.apply(retire,{_ribbonStrokeScratch:live},[other,true]);expect(staged.forget).toHaveBeenCalledTimes(1);expect(staged.destroy).not.toHaveBeenCalled();expect(other.scratch).toBeUndefined()
})

it('source notReady returns zero accepted INPUT prefix before raster and preserves previously accepted scratch state',()=>{
 const previous={x:-4,y:0},state={bristle:{ordinal:7,previous}},scratch={brushBehavior:state},notReady={kind:'notReady',reason:'prefix',retryKey:'changed-prefix'}
 const paint=vi.fn(),host={_beginCapability:()=>'bristleSoak139',_replayRibbonChunks:new Map(),_brush:{bristleSoakBinding:()=>({prefixKey:'accepted-A'})},_gridBinding:vi.fn(()=>notReady),_paintRibbonDabs:paint}
 const d={x:4,y:0,size:12,pressure:.5,opacity:.5,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:1}
 const result=Reflect.apply(PencilEngine.prototype['_paintSoak139'],host,[{},[d],'u','stroke-A','brush:own139@139',[1,0,0],undefined,undefined,scratch])
 expect(result).toEqual({...notReady,acceptedDabs:0});expect(paint).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBe(state);expect(state.bristle.ordinal).toBe(7)
})

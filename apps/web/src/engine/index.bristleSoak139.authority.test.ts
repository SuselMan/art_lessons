import{afterEach,expect,it,vi}from'vitest'
import type{StrokeOperation}from'@grafetto/shared'
import type{ILayerBuffer}from'./src/buffers/ILayerBuffer'
import type{CanonicalBeginBinding,CanonicalBeginRuntime,CanonicalBeginNotReady,CanonicalBeginResult,CanonicalBeginOwnerInfo}from'./src/dabs/CanonicalBeginRuntime'
import{OperationLog}from'./src/oplog/OperationLog'
import{createTestEngine,dab,makeStroke}from'./testing/engineTestUtils'
interface Host{_log:OperationLog;_layers:Map<string,ILayerBuffer>;_gridReplayTarget?:{target:ILayerBuffer;layerId:string};_gridReplayOperation?:StrokeOperation;_gridBinding(target:ILayerBuffer,userId:string,strokeId:string,capability?:'grid137'|'bristleSoak139'):CanonicalBeginRuntime|CanonicalBeginNotReady;_openCanonicalBegin(target:ILayerBuffer,binding:CanonicalBeginBinding,capability:'bristleSoak139'):CanonicalBeginResult;_canonicalBeginOwners(target?:ILayerBuffer):CanonicalBeginOwnerInfo[];_invalidateCanonicalBeginOwners(target:ILayerBuffer,reason:'prefix'):void}
const engines:Array<ReturnType<typeof createTestEngine>['engine']>=[]
afterEach(()=>{vi.restoreAllMocks();for(const e of engines)e.destroy();engines.length=0})
function setup(){const{engine}=createTestEngine();engines.push(engine);engine.initLayer('L');const h=engine as unknown as Host;h._log.onRevision=undefined;return{h,target:h._layers.get('L')!}}
const op=(id:string,strokeId:string,seq:number,dabs=[dab(-4,0)])=>makeStroke('u','L',dabs,{id,strokeId,seq,tool:'digitalBrush',preset:'brush:own-soak139@139'})
it('anchor A then foreign B then first real A line selects the line prefix, never anchor pixels or current post-line canvas',()=>{
 const{h,target}=setup();h._log.append(op('anchorA','A',1),{serverSeq:1});h._log.append(op('B','B',2),{serverSeq:2});h._log.append(op('lineA','A',3,[dab(4,0)]),{serverSeq:3})
 const runtime=h._gridBinding(target,'u','A','bristleSoak139');if('kind'in runtime)throw Error('unexpected source blocker')
 expect(runtime.binding.begin).toEqual({kind:'canonical',firstOpId:'lineA',seq:3});expect(JSON.parse(runtime.binding.prefixKey)[1]).toEqual(['anchorA','B'])
 expect(h._openCanonicalBegin(target,runtime.binding,'bristleSoak139')).toMatchObject({kind:'notReady',reason:'prefix'})
 h._gridReplayTarget={target,layerId:'L'};h._gridReplayOperation=h._log.entries[2].op as StrokeOperation
 const source=h._openCanonicalBegin(target,runtime.binding,'bristleSoak139');expect(source.kind).toBe('ready');if(source.kind==='ready'){source.view.assertCurrent();source.view.release();expect(()=>source.view.assertCurrent()).toThrow()}
})
it('Soak optimistic palette survives own append+ACK, but an earlier canonical B invalidates before continuation',()=>{
 const{h,target}=setup();const initial=h._gridBinding(target,'u','A','bristleSoak139');if('kind'in initial)throw Error('unexpected blocker')
 let owners:CanonicalBeginOwnerInfo[]=[{target,binding:initial.binding,capability:'bristleSoak139'}]
 vi.spyOn(h,'_canonicalBeginOwners').mockImplementation(()=>owners)
 const invalidate=vi.spyOn(h,'_invalidateCanonicalBeginOwners').mockImplementation(()=>{owners=[]})
 h._log.append(op('A1','A',10,[dab(-4,0),dab(4,0)]),{pending:true})
 expect(h._gridBinding(target,'u','A','bristleSoak139')).toEqual(initial);h._log.confirm('A1',10)
 expect(h._gridBinding(target,'u','A','bristleSoak139')).toEqual(initial);expect(invalidate).not.toHaveBeenCalled()
 h._log.append(op('earlierB','B',5),{serverSeq:5});expect(h._gridBinding(target,'u','A','bristleSoak139')).toMatchObject({kind:'notReady',reason:'prefix'});expect(invalidate).toHaveBeenCalledWith(target,'prefix')
})
it('Grid wrapper retains exact legacy binding shape and first-positive behavior',()=>{
 const{h,target}=setup();h._log.append(op('A1','A',1),{serverSeq:1});const old=h._gridBinding(target,'u','A')
 expect(Object.keys(old)).toEqual(['binding']);if('kind'in old)throw Error('unexpected');expect(old.binding.begin).toEqual({kind:'canonical',firstOpId:'A1',seq:1})
})

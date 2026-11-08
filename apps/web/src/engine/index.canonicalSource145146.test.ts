import{afterEach,expect,it,vi}from'vitest'
import type{StrokeOperation}from'@grafetto/shared'
import type{ILayerBuffer}from'./src/buffers/ILayerBuffer'
import type{CanonicalBeginCapability,CanonicalBeginRuntime,CanonicalBeginNotReady,CanonicalBeginOwnerInfo}from'./src/dabs/CanonicalBeginRuntime'
import{PencilEngine}from'./index'
import{FilterSmudge147Blocked}from'./src/dabs/FilterSmudge147'
import{OperationLog}from'./src/oplog/OperationLog'
import{createTestEngine,dab,makeStroke}from'./testing/engineTestUtils'
interface Host{_log:OperationLog;_layers:Map<string,ILayerBuffer>;_gridBinding(target:ILayerBuffer,userId:string,strokeId:string,capability:CanonicalBeginCapability):CanonicalBeginRuntime|CanonicalBeginNotReady;_canonicalBeginOwners(target?:ILayerBuffer):CanonicalBeginOwnerInfo[];_invalidateCanonicalBeginOwners(target:ILayerBuffer,reason:'prefix'):void}
const engines:Array<ReturnType<typeof createTestEngine>['engine']>=[]
afterEach(()=>{vi.restoreAllMocks();for(const e of engines)e.destroy();engines.length=0})
function setup(){const{engine}=createTestEngine();engines.push(engine);engine.initLayer('L');const h=engine as unknown as Host;h._log.onRevision=undefined;return{h,target:h._layers.get('L')!}}
const op=(id:string,strokeId:string,seq:number,size=4):StrokeOperation=>makeStroke('u','L',[dab(2,2,{size})],{id,strokeId,seq,tool:'digitalBrush',preset:'brush:source-begin-fixture@145'})
for(const capability of ['deformOld145','spray146'] as const){
 it(capability+' ignores zero metadata and captures before first positive request, even before any output particle',()=>{
  const{h,target}=setup();h._log.append(op('zero-A','A',1,0),{serverSeq:1});h._log.append(op('foreign-B','B',2),{serverSeq:2});h._log.append(op('positive-A','A',3),{serverSeq:3})
  const got=h._gridBinding(target,'u','A',capability);if('kind'in got)throw Error('unexpected blocker');expect(got.capability).toBe(capability);expect(got.binding.begin).toEqual({kind:'canonical',firstOpId:'positive-A',seq:3});expect(JSON.parse(got.binding.prefixKey)[1]).toEqual(['zero-A','foreign-B'])
 })
 it(capability+' retains BEGIN through own ACK and invalidates for an earlier foreign operation',()=>{
  const{h,target}=setup(),initial=h._gridBinding(target,'u','A',capability);if('kind'in initial)throw Error('unexpected blocker')
  let owners:CanonicalBeginOwnerInfo[]=[{target,binding:initial.binding,capability}];vi.spyOn(h,'_canonicalBeginOwners').mockImplementation(()=>owners);const invalidate=vi.spyOn(h,'_invalidateCanonicalBeginOwners').mockImplementation(()=>{owners=[]})
  h._log.append(op('A1','A',10),{pending:true});h._log.confirm('A1',10);expect(h._gridBinding(target,'u','A',capability)).toEqual(initial);expect(invalidate).not.toHaveBeenCalled()
  h._log.append(op('earlier-B','B',5),{serverSeq:5});expect(h._gridBinding(target,'u','A',capability)).toMatchObject({kind:'notReady',reason:'prefix'});expect(invalidate).toHaveBeenCalledWith(target,'prefix')
 })
}

it('Filter resource pause reports the whole call input prefix across renderer slices, not the last local slice',()=>{
 const outcome={kind:'notReady' as const,reason:'resource' as const,retryKey:'T-budget'},scratch={canonicalSource:{},brushBehavior:{dabSequence:9}}
 const host={_replayRibbonChunks:new Map(),_beginCapability:()=> 'filterSmudge147',_gridBinding:()=>({capability:'filterSmudge147',binding:{}}),_rebuildJobs:new Map(),_paintRibbonDabs:()=>{scratch.brushBehavior.dabSequence=14;throw new FilterSmudge147Blocked(outcome,1)}}
 const dabs=Array.from({length:7},()=>dab(0,0))
 const result=Reflect.apply(PencilEngine.prototype['_paintSoak139'],host,[{},dabs,'u','A','brush:filter147@147',[1,0,0],undefined,undefined,scratch])
 expect(result).toEqual({...outcome,acceptedDabs:5});expect(scratch.brushBehavior.dabSequence).toBe(14)
})

for(const capability of ['deformOld145','spray146','filterSmudge147'] as const)it(capability+' closes a metadata-only cold END without another source capture or painting',()=>{
 const target={},scratch={canonicalSource:{binding:{userId:'u',strokeId:'A'}}},finish=vi.fn(),finishGesture=vi.fn(),unexpected=()=>{throw Error('END must not capture or paint')}
 const host={_beginCapability:()=>capability,_replayRibbonChunks:new Map([['A',{target,scratch}]]),_brush:{finish},_smudge:{finishGesture},_gridBinding:unexpected,_paintSoak139:unexpected,_paintGrid137:unexpected}
 Reflect.apply(PencilEngine.prototype['_paintDabs'],host,[target,[],'digitalBrush','medium-round',[1,0,0],'u',undefined,undefined,'A',undefined,undefined,undefined,false,true])
 if(capability==='deformOld145'){expect(finishGesture).toHaveBeenCalledWith('u','A');expect(finish).not.toHaveBeenCalled()}else{expect(finish).toHaveBeenCalledWith(scratch,undefined);expect(finishGesture).not.toHaveBeenCalled()}
})

it('metadata END for another identity cannot retire a stamp BEGIN source',()=>{
 const target={},scratch={canonicalSource:{binding:{userId:'other',strokeId:'B'}}},finish=vi.fn(),host={_beginCapability:()=> 'spray146',_replayRibbonChunks:new Map([['A',{target,scratch}]]),_brush:{finish}}
 Reflect.apply(PencilEngine.prototype['_paintDabs'],host,[target,[],'digitalBrush','medium-round',[1,0,0],'u',undefined,undefined,'A',undefined,undefined,undefined,false,true]);expect(finish).not.toHaveBeenCalled()
})

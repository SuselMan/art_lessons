import {expect,it,vi} from 'vitest'
import {PencilEngine} from './index'
it.each([
 {at:100,shown:100,published:true,execution:true,input:true,defer:true},
 {at:116,shown:100,published:true,execution:true,input:true,defer:true},
 {at:117,shown:100,published:true,execution:true,input:true,defer:false},
 {at:100,shown:undefined,published:false,execution:true,input:true,defer:false},
 {at:100,shown:100,published:true,execution:false,input:true,defer:false},
 {at:100,shown:100,published:true,execution:true,input:false,defer:false},
])('bounds local preview coalescing and always schedules continued progress: %j',scenario=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(scenario.at)
 const advance=vi.fn(),schedule=vi.fn()
 const coordinator={advance,publishedPresentationReady:scenario.published,executionPending:scenario.execution,pending:true,completedPresentationRevision:1}
 const job={layerId:'layer',canonicalLayer:undefined as unknown}
 const owner={coordinator,generation:1,job,lastDisplayedPresentationRevision:1,lastLocalPresentationAt:scenario.shown,failed:false,retiring:false}
 job.canonicalLayer=owner
 const engine=Object.create(PencilEngine.prototype)
 Object.assign(engine,{_canonicalLayerOwner:owner,_physicalGeneration:1,_destroyed:false,_contextLost:false,_rebuildJobs:new Map([['layer',job]]),_authorProducer:{source:{prepared:{owner}}},_authorInput:{pending:scenario.input},_assertCanonicalLayerCurrent:()=>{},_deferCanonicalFollowPresentation:()=>undefined,_notifyCanonicalLocalCapacity:()=>{},_scheduleCanonicalRebuild:schedule})
 try{
  engine['_stepCanonicalLayer'](job as Parameters<PencilEngine['_stepCanonicalLayer']>[0])
  expect(advance).toHaveBeenCalledExactlyOnceWith(scenario.defer?{deferPresentation:true}:undefined)
  expect(schedule).toHaveBeenCalledExactlyOnceWith(job)
 }finally{clock.mockRestore()}
})

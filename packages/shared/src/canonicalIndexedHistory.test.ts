import {describe,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_CONTRACTS} from './canonicalStrokeFrame.js'
import {parseCanonicalIndexedHistoryOffer,parseCanonicalIndexedHistoryBegin,parseCanonicalHistoryOpenRequest,parseCanonicalHistoryStreamNext,parseCanonicalHistoryStreamEvidence,parseCanonicalHistoryStreamSelect,parseCanonicalHistoryStreamCancel,parseCanonicalHistoryStreamReopen} from './canonicalIndexedHistory.js'
const profiles=CANONICAL_STROKE_RASTER_CONTRACTS.slice(0,2).map(p=>p.profile)
const scope={roomId:'room',boardEpoch:2,allowedRasterProfiles:profiles}
const roomGeometry={width:512,height:512,infinite:false as const}
const offer={kind:'canonical-indexed-history-offer-v1',offerId:'offer',scope,roomGeometry,authorRasterProfile:profiles[0]}
const begin={kind:'canonical-indexed-history-begin-v1',streamId:'read',offerId:'offer',scope,roomGeometry,authorRasterProfile:profiles[0],floor:0,throughSeq:0,operationCount:0}
const root={originalUserId:'actor',strokeId:'stroke',layerId:'layer-1',firstOperationId:'first',firstSequence:1}
const requests:[(v:unknown)=>unknown,Record<string,unknown>][]=[
 [parseCanonicalHistoryOpenRequest,{kind:'canonical-history-open-v1',offerId:'offer',roomId:'room',boardEpoch:2}],
 [parseCanonicalHistoryStreamNext,{streamId:'read',requestId:'next',afterSeq:2048}],
 [parseCanonicalHistoryStreamEvidence,{streamId:'read',requestId:'evidence',root}],
 [parseCanonicalHistoryStreamSelect,{streamId:'read',requestId:'select',historyAction:'redo'}],
 [parseCanonicalHistoryStreamCancel,{streamId:'read',requestId:'cancel'}],
 [parseCanonicalHistoryStreamReopen,{mode:'recovery',offerId:'offer',roomId:'room',boardEpoch:2,throughSeq:2048}],
]
describe('indexed history closed data without read authority',()=>{
 it('copies the explicit mixed read policy without using the author as a whitelist',()=>{
  const parsed=parseCanonicalIndexedHistoryOffer(offer)
  expect(parsed.scope.allowedRasterProfiles).toEqual(profiles)
  expect(parsed.scope).not.toBe(scope)
  expect(Object.isFrozen(parsed.scope.allowedRasterProfiles)).toBe(true)
  expect(parsed).not.toHaveProperty('assertCurrent')
 })
 it.each([0,1025,100000,2147483647])('accepts a scalar cut %i beyond old batch limits, never an implicit page',cut=>{
  expect(parseCanonicalIndexedHistoryBegin({...begin,throughSeq:cut,operationCount:cut})).toMatchObject({floor:0,throughSeq:cut,operationCount:cut})
 })
 it.each([-1,1.5,2147483648,Infinity,NaN])('rejects a non-DB sequence %s',cut=>{
  expect(()=>parseCanonicalIndexedHistoryBegin({...begin,throughSeq:cut,operationCount:cut})).toThrow()
 })
 it('does not default an absent or undefined author profile',()=>{
  const {authorRasterProfile:_,...without}=offer
  expect(()=>parseCanonicalIndexedHistoryOffer(without)).toThrow()
  expect(()=>parseCanonicalIndexedHistoryOffer({...offer,authorRasterProfile:undefined})).toThrow()
  expect(()=>parseCanonicalIndexedHistoryBegin({...begin,authorRasterProfile:undefined})).toThrow()
 })
 it('rejects count, floor, geometry, or policy ambiguity',()=>{
  for(const v of [{...begin,operationCount:1},{...begin,floor:1},{...begin,roomGeometry:{...roomGeometry,infinite:true}},{...begin,roomGeometry:{...roomGeometry,width:0}},{...begin,scope:{...scope,rasterProfile:profiles[0]}},{...begin,scope:{...scope,allowedRasterProfiles:[profiles[0],profiles[0]]}}])expect(()=>parseCanonicalIndexedHistoryBegin(v)).toThrow()
 })
 it('rejects policy accessors before invoking them',()=>{
  const get=vi.fn(()=>profiles[0]),array=[...profiles]
  Object.defineProperty(array,'0',{get})
  expect(()=>parseCanonicalIndexedHistoryOffer({...offer,scope:{...scope,allowedRasterProfiles:array}})).toThrow()
  expect(get).not.toHaveBeenCalled()
 })
 it.each(requests)('captures bounded request own data with %s',(parse,value)=>{
  const parsed=parse(value)
  expect(parsed).toEqual(value)
  expect(parsed).not.toBe(value)
  expect(Object.isFrozen(parsed)).toBe(true)
  const get=vi.fn(()=>value[Object.keys(value)[0]])
  const accessor={...value};Object.defineProperty(accessor,Object.keys(value)[0],{get})
  for(const bad of [{...value,extra:1},{...value,[Symbol('extra')]:true},Object.create(value),accessor])expect(()=>parse(bad)).toThrow()
  expect(get).not.toHaveBeenCalled()
 })
 it('does not accept a root frame at zero or a free-form history action',()=>{
  expect(()=>parseCanonicalHistoryStreamEvidence({streamId:'read',requestId:'e',root:{...root,firstSequence:0}})).toThrow()
  expect(()=>parseCanonicalHistoryStreamSelect({streamId:'read',requestId:'s',historyAction:'clear'})).toThrow()
 })
})

it('keeps a follow range distinct from a full baseline and bounds each hop, not the session',async()=>{
 const {parseCanonicalIndexedHistoryFollow,parseCanonicalIndexedHistoryStart}=await import('./canonicalIndexedHistory.js')
 const follow={kind:'canonical-indexed-history-follow-v1',streamId:'follow',parentStreamId:'read',scope,roomGeometry,authorRasterProfile:profiles[0],floor:10000,throughSeq:10064,operationCount:64,latestObservedSeq:20000}
 expect(parseCanonicalIndexedHistoryFollow(follow)).toEqual(follow)
 expect(parseCanonicalIndexedHistoryStart(follow).kind).toBe(follow.kind)
 expect(()=>parseCanonicalIndexedHistoryBegin(follow)).toThrow()
 for(const v of [{...follow,throughSeq:10065,operationCount:65},{...follow,operationCount:10064},{...follow,latestObservedSeq:10063},{...follow,streamId:'read'}])expect(()=>parseCanonicalIndexedHistoryFollow(v)).toThrow()
 expect(parseCanonicalHistoryStreamReopen({mode:'follow',streamId:'read',requestId:'follow',afterSeq:10000})).toMatchObject({mode:'follow'})
 expect(()=>parseCanonicalHistoryStreamReopen({mode:'follow',offerId:'offer',roomId:'room',boardEpoch:2,throughSeq:10000})).toThrow()
})

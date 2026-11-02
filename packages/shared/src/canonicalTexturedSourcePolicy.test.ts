import {expect,it} from 'vitest'
import {supportsDrawingProtocol,supportsPrimaryTextureProtocol,DRAWING_PROTOCOL_VERSION} from './protocol.js'
import {canonicalAuthorTexturedSource,parseCanonicalIndexedHistoryOffer,parseCanonicalIndexedHistoryBegin,parseCanonicalIndexedHistoryFollow} from './canonicalIndexedHistory.js'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_RASTER_PROFILE as H} from './canonicalStrokeFrame.js'
const token='fixed-default-auto-texture-v4' as const
const common={scope:{roomId:'r',boardEpoch:1,allowedRasterProfiles:[G]},roomGeometry:{width:64,height:64,infinite:false},authorRasterProfile:G}
it('uses closed compatible3 vs strict4, never unknownfuture/numericcoercion',()=>{
 expect(DRAWING_PROTOCOL_VERSION).toBe('8');for(const v of ['3','4'])expect(supportsPrimaryTextureProtocol(v)).toBe(true)
 expect(supportsDrawingProtocol('3','4')).toBe(false);expect(supportsDrawingProtocol('4','4')).toBe(true);expect(supportsDrawingProtocol('7','4')).toBe(true)
 for(const v of [undefined,'9',4,'04','4, 3'])expect(supportsDrawingProtocol(v,'4')).toBe(false)
})
it('captures independent author4 DATA in Offer/OPEN/FOLLOW without inferring read permission',()=>{
 const o=parseCanonicalIndexedHistoryOffer({kind:'canonical-indexed-history-offer-v1',offerId:'O',...common,authorTexturedSource:token})
 const b=parseCanonicalIndexedHistoryBegin({kind:'canonical-indexed-history-begin-v1',offerId:'O',streamId:'S',...common,authorTexturedSource:token,floor:0,throughSeq:2,operationCount:2})
 const f=parseCanonicalIndexedHistoryFollow({kind:'canonical-indexed-history-follow-v1',parentStreamId:'S',streamId:'F',...common,authorTexturedSource:token,floor:2,throughSeq:3,operationCount:1,latestObservedSeq:4})
 expect([o.authorTexturedSource,b.authorTexturedSource,f.authorTexturedSource]).toEqual([token,token,token]);expect(Object.isFrozen(o)).toBe(true)
 expect(canonicalAuthorTexturedSource({},'authorTexturedSource',G)).toBeUndefined()
 for(const v of [undefined,false,'pressure-identity-subtract-v3','unknown'])expect(()=>canonicalAuthorTexturedSource({authorTexturedSource:v},'authorTexturedSource',G)).toThrow()
 expect(()=>canonicalAuthorTexturedSource({authorTexturedSource:token},'authorTexturedSource',H)).toThrow()
 let calls=0;const a={};Object.defineProperty(a,'authorTexturedSource',{get(){calls++;return token}});expect(()=>canonicalAuthorTexturedSource(a,'authorTexturedSource',G)).toThrow();expect(calls).toBe(0)
 expect(()=>canonicalAuthorTexturedSource(Object.create({authorTexturedSource:token}),'authorTexturedSource',G)).toThrow()
})

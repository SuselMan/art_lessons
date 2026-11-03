import {describe,it,expect,vi} from 'vitest'
import {canonicalPrimaryGrainMaterialContext,buildCanonicalPrimaryGrainMaterial} from './canonicalMaterialCodec.js'
import {decodeCanonicalPrimaryGrainStrokeFrame,canonicalStandaloneStrokeSnapshotV8} from './canonicalPrimaryGrainStandalone.js'
import {decodeCanonicalStrokeFrame,decodeCanonicalTexturedAutoStrokeFrame,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B} from './canonicalStrokeFrame.js'
const a={id:'asset:'+'11'.repeat(32),size:256,x:18,y:18,width:220,height:220},b={id:'asset:'+'22'.repeat(32),size:512,x:0,y:0,width:307,height:307}
function fixture(){
 const material=canonicalPrimaryGrainMaterialContext({version:8,assets:[a,b],primarySource:{kind:'image',asset:a.id,brushScale:.181818,brushAngle:3.14159,descriptorId:'structural-image',descriptorVersion:1,descriptorSha256:'d'.repeat(64)},primaryTexture:{kind:'canvasTexture',asset:b.id,law:'hard-multiply-u8-native-v1',width:307,height:307,periodX:307,periodY:307,phase:{kind:'resolved-stroke-phase-v1',x:306,y:1},strength:'recorded-grain-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}})
 const packed=buildCanonicalPrimaryGrainMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material).packed
 const trusted={materialVersion:8 as const,rasterProfile:G,brush:'brush:structural-image@1',strokeId:'stroke',frameOrdinal:0,pigmentRgb8:[12,34,56] as const,composition:{mode:'buildup' as const,alphaDarken:'hard' as const,outerResourceOpacity:.375,outerBlend:'over' as const},material}
 const envelope={version:2,rasterProfile:G,brush:trusted.brush,strokeId:trusted.strokeId,frameOrdinal:0,pigmentRgb8:trusted.pigmentRgb8,composition:trusted.composition,materialPacked:packed,texturePhase:material.primaryTexture.phase}
 const snapshot={layerId:'layer',brush:trusted.brush,strokeId:'stroke',boardEpoch:4,descriptorSha256:'d'.repeat(64),rasterProfile:G,pigmentRgb8:trusted.pigmentRgb8,composition:trusted.composition,assets:[{...a},{...b}],materialVersion:8,material}
 return{material,trusted,envelope,snapshot}
}
describe('named standalone image grain8 frame/snapshot, no public operation grant',()=>{
 it('normalizes exact GSC8 envelope and snapshot preserving ordinary source opacity',()=>{
  const f=fixture(),decoded=decodeCanonicalPrimaryGrainStrokeFrame(f.envelope,f.trusted),s=canonicalStandaloneStrokeSnapshotV8(f.snapshot,4,G)
  expect(decoded.envelope).toEqual(f.envelope);expect(decoded.envelope.composition.outerResourceOpacity).toBe(.375);expect(Object.isFrozen(decoded.frame)).toBe(true)
  expect(s.materialVersion).toBe(8);expect(s.assets).toEqual([a,b]);expect(s.descriptorSha256).toBe('d'.repeat(64));expect(s.material.primarySource).not.toHaveProperty('coverageProfile');expect(Object.isFrozen(s.material.primaryTexture.phase)).toBe(true)
 })
 it('rejects downgrade, browser, phase/crop and every pinned gesture-field mismatch',()=>{
  const f=fixture()
  for(const patch of [{version:1},{rasterProfile:B},{brush:'brush:structural-image@2'},{strokeId:'other'},{frameOrdinal:1},{materialPacked:f.envelope.materialPacked.replace(/^8/,'7')},{texturePhase:{kind:'resolved-stroke-phase-v1',x:0,y:1}},{texturePhase:{kind:'resolved-stroke-phase-v1',x:400,y:0}},{pigmentRgb8:[12,34,57]},{composition:{...f.envelope.composition,outerResourceOpacity:.5}},{composition:{...f.envelope.composition,mode:'wash'}},{composition:{...f.envelope.composition,outerBlend:'multiply'}},{extra:0}])expect(()=>decodeCanonicalPrimaryGrainStrokeFrame({...f.envelope,...patch},f.trusted)).toThrow()
  expect(()=>Reflect.apply(decodeCanonicalPrimaryGrainStrokeFrame,null,[f.envelope,{...f.trusted,materialVersion:7}])).toThrow()
  expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,null,[f.envelope,f.trusted])).toThrow()
  expect(()=>Reflect.apply(decodeCanonicalTexturedAutoStrokeFrame,null,[f.envelope,f.trusted])).toThrow()
 })
 it('binds snapshot original identity/SHA/assets2 in order without grant or mutable aliases',()=>{
  const f=fixture(),s=canonicalStandaloneStrokeSnapshotV8(f.snapshot,4,G);f.snapshot.assets[0].x=0
  expect(s.assets[0].x).toBe(18)
  for(const patch of [{descriptorSha256:'e'.repeat(64)},{brush:'brush:other@1'},{boardEpoch:5},{materialVersion:7},{rasterProfile:B},{assets:[b,a]},{assets:[a,{...b,width:512}]},{material:{...f.material,expectedDrawCount:0}},{extra:0}])expect(()=>canonicalStandaloneStrokeSnapshotV8({...fixture().snapshot,...patch},4,G)).toThrow()
 })
 it('rejects inherited/accessor envelope, trusted context and snapshot without invoking getters',()=>{
  const getter=vi.fn(()=>8)
  for(const target of ['envelope','trusted','snapshot']as const){const f=fixture(),x=f[target];Object.defineProperty(x,target==='envelope'?'materialPacked':'materialVersion',{get:getter});expect(()=>target==='snapshot'?canonicalStandaloneStrokeSnapshotV8(x,4,G):decodeCanonicalPrimaryGrainStrokeFrame(f.envelope,f.trusted)).toThrow()}
  expect(getter).not.toHaveBeenCalled();const f=fixture();expect(()=>decodeCanonicalPrimaryGrainStrokeFrame(Object.create(f.envelope),f.trusted)).toThrow()
 })
})

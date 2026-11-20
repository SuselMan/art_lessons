import{afterEach,describe,it,expect,vi}from'vitest'
import{genuineBristle93Fixture}from'../../testing/bristle93Fixture'
import{installBrushPixels,clearImportedBrushPixels}from'./importedBrushes'
import{prepareBristleSaturationLookup,bristleSaturationLookupReady,acquireBristleSaturationLookup}from'./bristleSaturationLookup'
import{retireBristleSaturationTable,bristleSaturationTableValue}from'./brushBristleSaturationTable'
const closed=<T>(value:T):T=>{if(value&&typeof value==='object'){for(const v of Object.values(value))closed(v);Object.freeze(value)}return value}
const fixture=()=>{const f=genuineBristle93Fixture();if(f.bristle.version!==2||!f.bristle.saturationLookup)throw Error('Expected genuine93');installBrushPixels(f.bristle.saturationLookup.asset,f.raw);return{...f,b:f.bristle}}
afterEach(()=>{clearImportedBrushPixels();vi.restoreAllMocks()})
describe('actual async93 BRP1 readiness binding, independent security cases',()=>{
 it('positive genuine compiler resource yields issued runtime table without quality',async()=>{const{b}=fixture();expect(bristleSaturationLookupReady(b)).toBe(false);await prepareBristleSaturationLookup(b);const r=acquireBristleSaturationLookup(b)
  try{expect('quality'in r.table).toBe(false);expect(Number.isFinite(bristleSaturationTableValue(r.table,r.profile,{counter:0,initialInk:1,pressure:1,length:1,samples:6},3,.7))).toBe(true)}finally{retireBristleSaturationTable(r.table)}
 })
 it('rejects stale declared profile hash through actual digest',async()=>{const{b}=fixture(),bad=closed({...b,saturationLookup:{...b.saturationLookup!,profileSha256:'0'.repeat(64)}});await expect(prepareBristleSaturationLookup(bad)).rejects.toThrow('profile checksum');expect(bristleSaturationLookupReady(bad)).toBe(false)})
 for(const key of['pressureWeight','bristleLengthWeight','bristleInkAmountWeight','inkDepletionWeight']as const)it('rejects stale binding after F64 '+key+' change invisible toF32',async()=>{const{b}=fixture(),before=b.ink[key],after=before+2**-40;expect(after).not.toBe(before);expect(Math.fround(after)).toBe(Math.fround(before));const bad=closed({...b,ink:{...b.ink,[key]:after}});await expect(prepareBristleSaturationLookup(bad)).rejects.toThrow('profile checksum');expect(bristleSaturationLookupReady(bad)).toBe(false)})
 it('rejects normalized curve mutation under old profile digest',async()=>{const{b}=fixture(),depletion=[...b.ink.depletion];depletion[1]=Math.fround(depletion[1]+.001);const bad=closed({...b,ink:{...b.ink,depletion}});await expect(prepareBristleSaturationLookup(bad)).rejects.toThrow('profile checksum')})
 it('rejects descriptor length inconsistent with actual binary',async()=>{const{b}=fixture(),bad=closed({...b,saturationLookup:{...b.saturationLookup!,byteLength:b.saturationLookup!.byteLength+8}});await expect(prepareBristleSaturationLookup(bad)).rejects.toThrow('compiled')})
 it('deduplicates genuine in-flight preparation',async()=>{const{b}=fixture(),first=prepareBristleSaturationLookup(b),second=prepareBristleSaturationLookup(b);expect(first).not.toBeNull();expect(second).toBe(first);await first;expect(prepareBristleSaturationLookup(b)).toBeNull()})
 it('raw eviction invalidates readiness and acquisition',async()=>{const{b}=fixture();await prepareBristleSaturationLookup(b);clearImportedBrushPixels();expect(bristleSaturationLookupReady(b)).toBe(false);expect(()=>acquireBristleSaturationLookup(b)).toThrow('not prepared')})
 it('rechecks raw owner identity after digest await and allows fresh retry',async()=>{const{b,raw}=fixture(),digest=crypto.subtle.digest.bind(crypto.subtle);let proceed!:()=>void;const barrier=new Promise<void>(r=>{proceed=r});vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args:Parameters<SubtleCrypto['digest']>)=>{await barrier;return digest(...args)})
  const pending=prepareBristleSaturationLookup(b);clearImportedBrushPixels();installBrushPixels(b.saturationLookup!.asset,raw);proceed();await expect(pending).rejects.toThrow('source changed');expect(bristleSaturationLookupReady(b)).toBe(false);vi.restoreAllMocks();await prepareBristleSaturationLookup(b);expect(bristleSaturationLookupReady(b)).toBe(true)
 })
})

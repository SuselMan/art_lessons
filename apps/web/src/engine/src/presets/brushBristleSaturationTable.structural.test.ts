/** Structural regression corpus for the canonical compiled Bristle kernel.
 * Genuine positive compiled once; no renderer/library admission is enabled. */
import{beforeAll,describe,expect,it}from'vitest'
import{createHash}from'node:crypto'
import{createBristleInkProfile,type BristleInkSettings}from'./brushBristleInk'
import{prepareBristleSaturationTable,copyBristleSaturationTable,loadBristleSaturationTable,retireBristleSaturationTable}from'./brushBristleSaturationTable'
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex')
interface BlobFixture{plane:Uint8Array;lookup:{asset:string;byteLength:number};ink:BristleInkSettings}
async function validFixtureForTest():Promise<BlobFixture>{
 const ink={depletion:Array.from({length:16},(_,i)=>Math.fround(i/15)),useOpacity:false,useSaturation:true,useWeights:true,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50}
 const profile=createBristleInkProfile(ink),prepared=prepareBristleSaturationTable(profile)
 if(prepared.kind!=='ready')throw Error('Genuine compiler refused positive: '+prepared.reason)
 try{
  const payload=copyBristleSaturationTable(prepared.table);let side=2;while(side*side<payload.length)side*=2
  const plane=new Uint8Array(side*side);plane.set(payload)
  return{plane,ink,lookup:{asset:`asset:${sha(plane)}`,byteLength:payload.length}}
 }finally{retireBristleSaturationTable(prepared.table)}
}
async function loadForTest(f:BlobFixture):Promise<unknown>{
 // Independent corpus CAS gate, not production readiness coverage.
 // Mutants rehash first so they reach the actual structural loader.
 if(f.lookup.asset!==`asset:${sha(f.plane)}`)throw Error('QA CAS integrity mismatch')
 const table=loadBristleSaturationTable(createBristleInkProfile(f.ink),f.plane,f.lookup.byteLength)
 try{return table}finally{retireBristleSaturationTable(table)}
}

let genuine:BlobFixture
const view=(b:Uint8Array)=>new DataView(b.buffer,b.byteOffset,b.byteLength)
const clone=():BlobFixture=>({plane:genuine.plane.slice(),lookup:{...genuine.lookup},ink:{...genuine.ink,depletion:[...genuine.ink.depletion]}})
const u32=(at:number,value:number)=>(f:BlobFixture)=>view(f.plane).setUint32(at,value,true)
const f64=(at:number,value:number)=>(f:BlobFixture)=>view(f.plane).setFloat64(at,value,true)
type Attack=readonly[name:string,mutate:(f:BlobFixture)=>void]
const attacks:readonly Attack[]=[
 ['wrong magic',u32(0,0)],['wrong format version',u32(4,2)],
 ['zero rows',u32(8,0)],['row maximum+1',u32(8,127)],['row product uint overflow',u32(8,0xffffffff)],
 ['remove required nonconstant segments',u32(12,0)],['segment maximum+1',u32(12,513)],
 ['zero tree base',u32(16,0)],['non-power-of-two tree base',u32(16,3)],['tree product uint overflow',u32(16,0x80000000)],
 ['zero tail start',u32(20,0)],['tail beyond curve amount',f=>view(f.plane).setUint32(20,view(f.plane).getUint32(56,true)+1,true)],
 ['tail NaN',f64(24,NaN)],['tail plus infinity',f64(24,Infinity)],['tail minus infinity',f64(24,-Infinity)],
 ['max parameter NaN',f64(32,NaN)],['max parameter infinity',f64(32,Infinity)],['invalid boolean flag',u32(40,2)],['wrong valid flag for bound profile',f=>{const v=view(f.plane);v.setUint32(40,1-v.getUint32(40,true),true)}],
 ['params overlap header',u32(44,0)],['unaligned params',u32(44,65)],['params uint wrap offset',u32(44,0xfffffffc)],
 ['segments uint wrap offset',u32(48,0xfffffff8)],['tree outside plane',u32(52,0xffffffff)],['tree overlaps params',f=>view(f.plane).setUint32(52,64,true)],
 ['zero amount',u32(56,0)],['amount maximum+1',u32(56,65537)],['logical header truncated',u32(60,63)],['logical size maximum+1',u32(60,524289)],
 ['parameter NaN',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(44,true),NaN,true)}],
 ['parameter infinity',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(44,true),Infinity,true)}],
 ['parameter minus infinity',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(44,true),-Infinity,true)}],
 ['descending parameter rows',f=>{const v=view(f.plane),p=v.getUint32(44,true);v.setFloat32(p+8,v.getFloat32(p,true)-1,true)}],
 ['parameter row index outside table',f=>{const v=view(f.plane);v.setUint32(v.getUint32(44,true)+4,v.getUint32(8,true),true)}],
 ['duplicate canonical row index',f=>{const v=view(f.plane);v.setUint32(v.getUint32(44,true)+12,0,true)}],
 ['zero first segment end',f=>{const v=view(f.plane);v.setUint32(v.getUint32(48,true),0,true)}],
 ['nonincreasing segment ends',f=>{const v=view(f.plane),p=v.getUint32(48,true);v.setUint32(p+8,v.getUint32(p,true),true)}],
 ['last segment does not reach tail',f=>{const v=view(f.plane);v.setUint32(v.getUint32(48,true)+(v.getUint32(12,true)-1)*8,v.getUint32(20,true)-1,true)}],
 ['segment q NaN',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(48,true)+4,NaN,true)}],
 ['segment q infinity',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(48,true)+4,Infinity,true)}],
 ['segment q zero',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(48,true)+4,0,true)}],
 ['segment q negative',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(48,true)+4,-1,true)}],
 ['tree scale NaN',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(52,true),NaN,true)}],
 ['tree scale plus infinity',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(52,true),Infinity,true)}],
 ['tree cap NaN',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(52,true)+4,NaN,true)}],
 ['tree cap plus infinity',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(52,true)+4,Infinity,true)}],
 ['positive log ceiling',f=>{const v=view(f.plane);v.setFloat32(v.getUint32(52,true)+4,1,true)}],
 ['nonzero canonical zero padding',f=>{f.plane[f.lookup.byteLength]=1}],
]
beforeAll(async()=>{genuine=await validFixtureForTest();const v=view(genuine.plane)
 expect(Math.sqrt(genuine.plane.byteLength)).toBe(2**Math.ceil(Math.log2(Math.sqrt(genuine.lookup.byteLength))));expect(genuine.lookup.byteLength).toBeLessThanOrEqual(524288)
 expect(v.getUint32(8,true)).toBeGreaterThanOrEqual(2);expect(v.getUint32(12,true)).toBeGreaterThanOrEqual(3);expect(v.getUint32(16,true)).toBeGreaterThanOrEqual(2)
 expect(genuine.lookup.asset).toBe('asset:'+sha(genuine.plane))
 // Positive FIRST: a broken adapter or wrong fixture cannot make negatives green.
 expect(await loadForTest(clone())).toBeTruthy()
})
describe('compiled93 malicious bytes with genuine CAS hashes',()=>{
 for(const[name,mutate]of attacks)it('rejects '+name+' after recomputed CAS digest',async()=>{
  const f=clone();mutate(f);f.lookup.asset=`asset:${sha(f.plane)}`
  await expect(loadForTest(f)).rejects.toThrow()
 })
 it('rejects byte damage under unchanged CAS identity at source readiness',async()=>{const f=clone();f.plane[0]^=1;await expect(loadForTest(f)).rejects.toThrow()})
 it('rejects descriptor logical length inconsistent with the real header',async()=>{const f=clone();f.lookup.byteLength+=8;await expect(loadForTest(f)).rejects.toThrow()})
 // Async BRP1 readiness binding tests are intentionally separate/not claimed.
 // -Infinity internal log values are NOT a blanket negative: the format allows
 // absorbing semantics. A compiler-issued absorbing fixture belongs in positives.
 // Arbitrary valid trees with all metadata/digests relabelled are NOT claimed
 // cryptographically tied to source: trusted server regenerates before admission.
})

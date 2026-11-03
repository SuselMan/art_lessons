import {KritaRandomSource,qt5QStringHash} from './nativeRandom'
import type {SourceCoverageEvaluator} from './sourceCoverageEvaluator'
export const SOURCE_SEEDED_AUTO_MASK_PROFILE='seeded-auto-mask-browser-v1' as const
/** Author calls once for an actual definition/draw, then RECORDS this uint32.
 * Replay consumes recipe.maskSeed; it never reconstructs author identity. */
export function sourceAutoMaskSeed(input:{readonly strokeId:string;readonly descriptorSha256:string;readonly role:'primary'|'mask';readonly drawOrdinal:number}):number {
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError('Invalid mask seed identity')
 const names=['strokeId','descriptorSha256','role','drawOrdinal'] as const
 if(Reflect.ownKeys(input).length!==names.length)throw new TypeError('Invalid mask seed identity')
 const values=names.map(name=>{const p=Object.getOwnPropertyDescriptor(input,name);if(!p||!Object.hasOwn(p,'value'))throw new TypeError('Mask seed identity requires own DATA');return p.value})
 const [stroke,sha,role,ordinal]=values
 if(typeof stroke!=='string'||!stroke.length||stroke.length>8192||stroke.includes('\0')||typeof sha!=='string'||!/^[a-f0-9]{64}$/.test(sha)||(role!=='primary'&&role!=='mask')||!Number.isSafeInteger(ordinal)||ordinal<0)throw new TypeError('Invalid mask seed identity')
 return qt5QStringHash(JSON.stringify([SOURCE_SEEDED_AUTO_MASK_PROFILE,stroke,sha,role,ordinal]))
}
/** Request-local row-major browser stream. Randomness samples EVERY pixel;
 * density samples only coverage still visible after truncation. Conditional
 * ordering follows the native scalar/vector applicator principle, not its seed
 * or SSE/FMA coverage identity. No cross-request RNG or hidden resampling. */
export function sourceSeededAutoMask(base:SourceCoverageEvaluator,input:{readonly seed:number;readonly randomness:number;readonly density:number;readonly maxWorkSamples:number}):SourceCoverageEvaluator {
 const {seed,randomness,density,maxWorkSamples}=input
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||Object.is(seed,-0)||![randomness,density].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Number.isSafeInteger(maxWorkSamples)||base.pixels*(base.samplesPerPixel+Number(randomness!==0)+Number(density!==1))>maxWorkSamples){base.cancel();throw new RangeError('Invalid seeded Auto mask bound')}
 const random=new KritaRandomSource(seed)
 let completed=0,work=0,cancelled=false,busy=false
 let pending:{target:Uint8Array;offset:number;length:number;at:number;stage:0|1}|undefined
 return {
  pixels:base.pixels,route:'browser-number',samplesPerPixel:base.samplesPerPixel,
  get completedPixels(){return completed},get workSamples(){return work},get done(){return completed===base.pixels&&!cancelled},
  advance(target,offset,maxSamples){
   if(cancelled||busy)throw new Error('Seeded mask cursor unavailable')
   if(!(target instanceof Uint8Array)||!Number.isSafeInteger(offset)||offset<0||offset>target.length||!Number.isSafeInteger(maxSamples)||maxSamples<1)throw new RangeError('Invalid seeded mask continuation')
   busy=true
   try{
    if(!pending){
     const result=base.advance(target,offset,maxSamples);work+=result.consumed
     if(result.written)pending={target,offset,length:result.written,at:0,stage:0}
     return {written:0,consumed:result.consumed,done:completed===base.pixels}
    }
    if(pending.target!==target||pending.offset!==offset)throw new Error('Seeded mask stripe changed')
    let consumed=0
    while(pending.at<pending.length&&consumed<maxSamples){
     const at=pending.offset+pending.at
     if(pending.stage===0){
      if(randomness!==0){target[at]=Math.trunc(target[at]*((1-randomness)+randomness*random.generateNormalized()));consumed++;work++}
      pending.stage=1
      if(consumed===maxSamples)break
     }
     if(density!==1&&target[at]!==0){if(!(density>=random.generateNormalized()))target[at]=0;consumed++;work++}
     pending.at++;pending.stage=0
    }
    if(pending.at<pending.length)return {written:0,consumed,done:false}
    const written=pending.length;pending=undefined;completed+=written
    return {written,consumed,done:completed===base.pixels}
   }catch(error){cancelled=true;pending=undefined;try{base.cancel()}catch{}throw error}finally{busy=false}
  },
  cancel(){cancelled=true;pending=undefined;base.cancel()},
 }
}

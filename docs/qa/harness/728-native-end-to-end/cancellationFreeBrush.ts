import {CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/brush'
/** QA OFF alternative, equivalent over real arithmetic for finite raw>=0,
 * integer donor q>=0 and room>=0. F32/Q8 order changes intentionally; original
 * GL reference remains UNCHANGED. No epsilon, floor bias or artistic tuning. */
export function cancellationFreeBrushShader(){
 const start=CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.indexOf('fn fraction('),end=CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.indexOf('@compute @workgroup_size')
 if(start<0||end<=start)throw Error('Exact original fraction seam changed')
 const original=CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.slice(start,end)
 if(!original.includes('return amount*limit;'))throw Error('Original fraction capacity form differs')
 const replacement=original.replace('var limit=1.0;','var fraction=amount;')
  .replace('for(var k=0u;k<4u;k++){limit=min(limit,channelLimit(P[k],roomP[k],amount));}','for(var k=0u;k<4u;k++){if(P[k]>=.5){fraction=min(fraction,roomP[k]/P[k]);}}')
  .replace('for(var k=0u;k<4u;k++){limit=min(limit,channelLimit(C[k],roomC[k],amount));}','for(var k=0u;k<4u;k++){if(C[k]>=.5){fraction=min(fraction,roomC[k]/C[k]);}}')
  .replace('return amount*limit;','return fraction;')
 if(replacement===original||replacement.includes('var limit=')||replacement.includes('channelLimit(P[')||replacement.includes('channelLimit(C['))throw Error('Bounded fraction replacement incomplete')
 return CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.slice(0,start)+replacement+CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.slice(end)
}
/** Real-number scalar reference only; never a GPU/hardware parity oracle. */
export function cancellationFreeFractionReference(raw:number,donors:readonly number[],rooms:readonly number[]){
 if(!Number.isFinite(raw)||raw<0||donors.length!==8||rooms.length!==8||donors.some(q=>!Number.isInteger(q)||q<0||q>255)||rooms.some(c=>!Number.isInteger(c)||c<0||c>63))throw Error('Finite original Q8 fraction inputs')
 let oldLimit=1,fraction=raw
 for(let i=0;i<8;i++){const q=donors[i],cap=rooms[i];if(q===0||raw===0)continue;oldLimit=Math.min(oldLimit,cap/(q*raw));fraction=Math.min(fraction,cap/q)}
 return{old:raw*oldLimit,cancellationFree:fraction}
}

import type {AlgorithmInput} from './protocol'
/** Outside timing: compare raw carriers with their immutable initial wet domain.
 * Existing dry pigment is a literal, not newly escaped material. No output repair. */
export function auditInitialWet(input:AlgorithmInput,output:Uint8Array){
 const pixels=input.size*input.size
 if(output.length!==pixels*4||input.rgba.length!==pixels*4||input.water.length!==pixels)throw Error('Wet audit dimensions')
 let wetPixels=0,dryPixels=0,changedDryPixels=0,changedDryChannels=0,maxDryByteDelta=0,newPigmentDryPixels=0,wetChangedPixels=0
 const dryDeltaRGBA=[0,0,0,0]
 for(let i=0;i<pixels;i++){
  let changed=false,added=false
  if(input.water[i]>0){wetPixels++;for(let k=0;k<4;k++)changed ||= output[i*4+k]!==input.rgba[i*4+k];wetChangedPixels+=Number(changed);continue}
  dryPixels++
  for(let k=0;k<4;k++){const before=input.rgba[i*4+k],after=output[i*4+k],delta=after-before;dryDeltaRGBA[k]+=delta;changed ||= delta!==0;added ||= after>before;if(delta!==0)changedDryChannels++;maxDryByteDelta=Math.max(maxDryByteDelta,Math.abs(delta))}
  changedDryPixels+=Number(changed);newPigmentDryPixels+=Number(added)
 }
 return{policy:'initial-raw-water-positive-v1',threshold:0,wetPixels,dryPixels,changedDryPixels,changedDryChannels,maxDryByteDelta,newPigmentDryPixels,dryDeltaRGBA,wetChangedPixels,dryIdentity:changedDryPixels===0,qualification:'Raw output identity outside initial water; no clipping or mutation. Does not certify internal water/transport paths or conservation inside the wet area.'}
}

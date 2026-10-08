/** Diagnostic full-field readback; explicitly excluded from latency and animation claims. */
export function retainedWaterSummary(v,pigment,width,height){
 if(v.length!==width*height*4||pigment.length!==v.length)throw Error('Actual matching RGBA fields required');
 const sum=[0,0,0,0],max=[0,0,0,0];let wet=0,outsidePigment=0,rEqualsA=0;const bbox=[width,height,-1,-1];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;for(let c=0;c<4;c++){sum[c]+=v[i+c];max[c]=Math.max(max[c],v[i+c])}if(v[i+3]){rEqualsA+=v[i]===v[i+3];if(v[i]>0){wet++;outsidePigment+=pigment[i+3]===0;bbox[0]=Math.min(bbox[0],x);bbox[1]=Math.min(bbox[1],y);bbox[2]=Math.max(bbox[2],x);bbox[3]=Math.max(bbox[3],y)}}}
 return{width,height,sum,max,wet,rEqualsA,outsidePigment,bbox,pack:'retained GL solvent R=water dose,A=dose; G/B must be measured',limitation:'GPU readback perturbs cadence; not latency proof'}
}
export function readRetainedWater(owner){const f=owner.lease.fields;return{sequence:owner.token.sequence,...retainedWaterSummary(f.solventLoad.readPixels(),f.pigmentLoad.readPixels(),1024,1024)}}

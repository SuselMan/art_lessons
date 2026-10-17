/** Exact squared Euclidean distance to initial carrier support. CPU analysis only;
 * never include this work in solver timing. Native and common carriers must use
 * an identical fixed conversion scale before calling. Not a pigment ownership map. */
function edt1(f:Float64Array,out:Float64Array,n:number,v:Int32Array,z:Float64Array){
 let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity
 for(let q=1;q<n;q++){
  let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]))
  while(s<=z[k]){k--;s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]))}
  v[++k]=q;z[k]=s;z[k+1]=Infinity
 }
 k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;out[q]=(q-v[k])**2+f[v[k]]}
}
export function supportDistances(rgba:Uint8Array,size:number,threshold=1){
 if(rgba.length!==size*size*4)throw Error('RGBA size mismatch')
 const field=new Float64Array(size*size),f=new Float64Array(size),d=new Float64Array(size),v=new Int32Array(size),z=new Float64Array(size+1)
 let support=0
 for(let y=0;y<size;y++){for(let x=0;x<size;x++){const present=rgba[(y*size+x)*4+3]>threshold;f[x]=present?0:1e12;if(present)support++}edt1(f,d,size,v,z);field.set(d,y*size)}
 for(let x=0;x<size;x++){for(let y=0;y<size;y++)f[y]=field[y*size+x];edt1(f,d,size,v,z);for(let y=0;y<size;y++)field[y*size+x]=d[y]}
 return{distanceSquared:field,supportPixels:support}
}
export function transportMetrics(before:Uint8Array,after:Uint8Array,size:number,water?:Uint8Array){
 if(after.length!==before.length)throw Error('Carrier size mismatch')
 const {distanceSquared,supportPixels}=supportDistances(before,size),limits=[10,25,50,100],mass=limits.map(()=>0),pixels=limits.map(()=>0)
 let initial=0,total=0,distanceMoment=0,changedDry=0,initialR=0,outR=0,initialG=0,outG=0,initialB=0,outB=0
 for(let i=0;i<size*size;i++){
  const p=i*4,a=after[p+3];initial+=before[p+3];total+=a;initialR+=before[p];initialG+=before[p+1];initialB+=before[p+2];outR+=after[p];outG+=after[p+1];outB+=after[p+2]
  if(supportPixels&&a>1){distanceMoment+=a*distanceSquared[i];for(let k=0;k<limits.length;k++)if(distanceSquared[i]>=limits[k]**2){mass[k]+=a;pixels[k]++}}
  if(water?.[i]===0&&after.subarray(p,p+4).some((b,k)=>b!==before[p+k]))changedDry++
 }
 return{scope:'Exact distance from initial alpha>1 support; bounded carrier proxy, not physical pigment mass',supportPixels,inputAlpha:initial,outputAlpha:total,alphaRatio:initial?total/initial:null,channelRatios:[initialR?outR/initialR:null,initialG?outG/initialG:null,initialB?outB/initialB:null],rmsDistanceFromSupport:supportPixels&&total?Math.sqrt(distanceMoment/total):0,beyond:limits.map((distance,k)=>({distance,pixels:pixels[k],alpha:mass[k],fraction:total?mass[k]/total:0})),changedDryPixels:changedDry}
}

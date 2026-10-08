/** Separate F32 scalar reference. It predicts a narrowly captured threshold;
 * it is not a WGSL compiler/fused instruction or portable GPU guarantee. */
export function fbmArithmetic(lattice:Uint8Array,p:readonly[number,number]){
 if(lattice.length!==251*251)throw Error('Actual251 noise lattice required')
 const f=Math.fround,mix=(a:number,b:number,t:number)=>f(f(a*f(1-t))+f(b*t))
 const noise=(p:readonly[number,number])=>{
  const i=p.map(Math.floor),v=p.map((x,k)=>f(x-i[k])),u=v.map(x=>f(f(x*x)*f(3-f(2*x))))
  const sample=(dx:number,dy:number)=>f(lattice[((i[1]+dy)%251+251)%251*251+((i[0]+dx)%251+251)%251]/255)
  return mix(mix(sample(0,0),sample(1,0),u[0]),mix(sample(0,1),sample(1,1),u[0]),u[1])
 }
 const sequential=p.map((x,i)=>f(f(x*f(2.7))+f([31.4,17.9][i]))) as[number,number]
 // Products of these bounded24bit inputs and their addition are exact in JS
 // double before one F32 rounding; this does not emulate arbitrary FP32 FMA.
 const fused=p.map((x,i)=>f(x*f(2.7)+f([31.4,17.9][i]))) as[number,number]
 const first=noise(p),combine=(x:number)=>f(f(f(.63)*first)+f(f(.37)*x)),seqNoise=noise(sequential),fusedNoise=noise(fused)
 const quant24=(x:number)=>Math.floor(f(f(x)*f(16777215)))
 return{p,sequential,fused,firstNoise:first,sequentialNoise:seqNoise,fusedNoise,fbmSequential:combine(seqNoise),fbmFused:combine(fusedNoise),quantSequential:quant24(combine(seqNoise)),quantFused:quant24(combine(fusedNoise))}
}

/** Krita radius-to-sigma and finite support; coefficients computed on CPU,
 * uploaded as constants, never evaluated with GPU-dependent exponentials. */
export function filterKernel(radius:number):Float32Array{
 const weights=new Float32Array(37)
 if(radius===0){weights[18]=1;return weights}
 const sigma=.3*radius+.3,reach=3*Math.ceil(sigma)
 let sum=0
 for(let x=-reach;x<=reach;x++){const value=Math.exp(-x*x/(2*sigma*sigma));weights[18+x]=value;sum+=value}
 for(let i=0;i<weights.length;i++)weights[i]/=sum
 return weights
}
export function filterReach(radius:number):number{return radius===0?0:3*Math.ceil(.3*radius+.3)}

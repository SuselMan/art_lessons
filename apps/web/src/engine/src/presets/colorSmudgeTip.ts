/** Pack straight CAS colour planes into one premultiplied RGBA sampler.
 * One texture keeps the WebGL1 eight-sampler limit and interpolation correct. */
export function colorSmudgeTipPixels(alpha:Uint8Array,channels:readonly Uint8Array[]):Uint8Array {
 if(channels.length!==3||channels.some(c=>c.length!==alpha.length))throw Error('Colour tip plane dimensions differ')
 const rgba=new Uint8Array(alpha.length*4)
 for(let i=0;i<alpha.length;i++){
  for(let c=0;c<3;c++)rgba[i*4+c]=Math.floor((channels[c][i]*alpha[i]+127)/255)
  rgba[i*4+3]=alpha[i]
 }
 return rgba
}

import {isBrushGradient} from '@grafetto/shared'

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

/** Build the palette derivative once per frame/palette, before drawing. No
 * extra shader sampler or per-dab CPU image conversion. */
export function colorSmudgeGradientTipPixels(alpha:Uint8Array,gray:Uint8Array,lut:string):Uint8Array {
 if(alpha.length!==gray.length||!isBrushGradient(lut))throw Error('Invalid gradient tip resource')
 const palette=Uint8Array.from({length:1024},(_,i)=>parseInt(lut.slice(i*2,i*2+2),16)),rgba=new Uint8Array(alpha.length*4)
 for(let i=0;i<alpha.length;i++){
  const index=gray[i]*4,a=Math.floor((alpha[i]*palette[index+3]+127)/255)
  for(let c=0;c<3;c++)rgba[i*4+c]=Math.floor((palette[index+c]*a+127)/255)
  rgba[i*4+3]=a
 }
 return rgba
}

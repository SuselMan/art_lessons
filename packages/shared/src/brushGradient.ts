import type {BrushSourceContext} from './brushSource.js'

export type GradientColor = readonly [number,number,number,number]
export function isBrushGradient(value:unknown):value is string {
 return typeof value==='string'&&/^[0-9a-f]{2048}$/.test(value)
}

/** The canvas resource is sampled once at pen-down, including alpha. */
export function makeBrushGradient(start:GradientColor,end:GradientColor):string {
 if(start.length!==4||end.length!==4||[...start,...end].some(value=>!Number.isFinite(value)||value<0||value>1))throw Error('Invalid gradient endpoint')
 let result=''
 for(let i=0;i<256;i++)for(let channel=0;channel<4;channel++){
  const byte=Math.round((start[channel]+(end[channel]-start[channel])*i/255)*255)
  result+=byte.toString(16).padStart(2,'0')
 }
 return result
}

const decoded=new WeakMap<BrushSourceContext,Uint8Array>()
export function sampleBrushGradient(source:BrushSourceContext,position:number):{color:[number,number,number];alpha:number} {
 if(!Number.isFinite(position))throw Error('Invalid gradient position')
 let bytes=decoded.get(source)
 if(!bytes){
  if(!isBrushGradient(source.gradient))throw Error('Missing captured brush gradient')
  bytes=Uint8Array.from({length:1024},(_,i)=>parseInt(source.gradient!.slice(i*2,i*2+2),16))
  if(Object.isFrozen(source))decoded.set(source,bytes)
 }
 const offset=Math.min(1,Math.max(0,position))*255,lo=Math.floor(offset),hi=Math.min(255,lo+1),fraction=offset-lo
 const at=(channel:number)=>(bytes[lo*4+channel]*(1-fraction)+bytes[hi*4+channel]*fraction)/255
 return {color:[at(0),at(1),at(2)],alpha:at(3)}
}

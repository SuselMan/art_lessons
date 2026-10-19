/** Seeded brush-local transverse delivery. No world-space noise or GPU hash. */
export function bristleProfile805(seed:number){
 let state=(seed|0)||1;const noise=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}
 const knots=Array.from({length:48},()=>.25+noise()*1.5),bytes=new Uint8Array(256)
 for(let i=0;i<256;i++){const x=i/255*47,j=Math.floor(x),t=x-j,s=t*t*(3-2*t);let v=knots[j]*(1-s)+knots[Math.min(47,j+1)]*s;v*=.9+.2*noise();bytes[i]=Math.max(12,Math.min(255,Math.round(v*128)))}
 return{bytes,mean:bytes.reduce((a,b)=>a+b,0)/bytes.length/128}
}

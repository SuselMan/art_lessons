import type {AlgorithmInput} from '../protocol'
/** A coarse source exists only when every raw donor in its 4x4 footprint is wet. */
export function reduceWet(input:AlgorithmInput){
 if(input.size!==1024||input.water.length!==1024**2||input.rgba.length!==1024**2*4)throw Error('hybrid requires full1024 input')
 const rgba=new Uint8Array(256**2*4),domain=new Uint8Array(256**2*4)
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  let wet=true;const sum=[0,0,0,0]
  for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){const i=(y*4+dy)*1024+x*4+dx;wet=wet&&input.water[i]>0;for(let c=0;c<4;c++)sum[c]+=input.rgba[i*4+c]}
  const j=(y*256+x)*4;domain[j]=wet?255:0;domain[j+3]=255
  if(wet)for(let c=0;c<4;c++)rgba[j+c]=Math.round(sum[c]/16)
 }
 return{rgba,domain}
}
/** Mirrors the four actual bilerp donor cells; no broad reconstruction near blocked cells. */
export function safeFootprint(domain:Uint8Array,x:number,y:number){
 const qx=Math.max(0,Math.min(255,(x+.5)/4-.5)),qy=Math.max(0,Math.min(255,(y+.5)/4-.5)),ix=Math.floor(qx),iy=Math.floor(qy),jx=Math.min(255,ix+1),jy=Math.min(255,iy+1)
 return [[ix,iy],[jx,iy],[ix,jy],[jx,jy]].every(([a,b])=>domain[(b*256+a)*4]===255)
}

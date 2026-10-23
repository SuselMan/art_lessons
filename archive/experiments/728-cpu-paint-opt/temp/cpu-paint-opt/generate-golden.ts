import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { buildRibbonBands } from './markerRibbon-baseline'
let dabs=Array.from({length:8},(_,i)=>({x:i%3*5,y:i%2*-7,pressure:i===7?0:.03+i*.11,tiltX:0,tiltY:0,size:i%3?230:0,aspectRatio:.3+i*.8,angle:i*.61,opacity:i%2?-.1:.937,t:i*17}))
dabs[2]={...dabs[2],x:dabs[1].x,y:dabs[1].y}
dabs=JSON.parse(JSON.stringify(dabs))
const material=(_a:any,d:any,travel:number)=>({ink:d.opacity*travel*.137,water:.713,paperWet:d.pressure*.27,strength:-.923,puddle:.67,pigmentPool:.49})
const cases=[]
for(const shape of ['ellipse','roundedBox'] as const)for(const film of [false,true])for(const scale of [.63,1,2]) {
 const a=buildRibbonBands(dabs,scale,undefined,shape,.23,.71,material,film)
 cases.push({shape,film,scale,length:a.length,sha256:createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex')})
}
writeFileSync('apps/web/src/engine/src/dabs/ribbonVertexGolden.json',JSON.stringify({source:'f7dc9c3d:markerRibbon.ts before CPU changes',dabs,cases},null,2)+'\n')

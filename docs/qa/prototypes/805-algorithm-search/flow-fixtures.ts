import {paperBytes} from './fixtures'
import type {AlgorithmInput} from './protocol'
export const flowIds=['flow-pool-drop','flow-separated-colors','flow-dry-barrier','flow-isolated-pools','flow-one-pixel-wall','flow-thin-neck','flow-paper-drop','flow-water-only','flow-dry-pigment','flow-near-colors'] as const
export function createFlowFixture(id:string,size=1024):AlgorithmInput{
 if(!flowIds.includes(id as any))throw Error('Unknown flow fixture '+id)
 const rgba=new Uint8Array(size*size*4),water=new Uint8Array(size*size),paper=id==='flow-paper-drop'?paperBytes(size):new Uint8Array(size*size).fill(128)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const X=x*1024/size,Y=y*1024/size,i=y*size+x,p=i*4
  let wet=(id==='flow-pool-drop'||id==='flow-paper-drop')?Math.hypot(X-512,Y-512)<320:X>=190&&X<834&&Y>=310&&Y<714
  if(id==='flow-dry-barrier'&&Math.abs(X-512)<2)wet=false
  if(id==='flow-one-pixel-wall'&&Math.floor(X)===513)wet=false
  if(id==='flow-thin-neck')wet=Math.hypot(X-360,Y-512)<140||Math.hypot(X-664,Y-512)<140||(X>=360&&X<=664&&Y>=506&&Y<=518)
  if(id==='flow-isolated-pools')wet=Math.hypot(X-360,Y-512)<140||Math.hypot(X-664,Y-512)<140
  water[i]=id==='flow-dry-pigment'?0:wet?180:0
  const blue=Math.hypot(X-((id==='flow-pool-drop'||id==='flow-paper-drop')?512:id==='flow-near-colors'?472:392),Y-512)<26
  const yellow=id!=='flow-pool-drop'&&id!=='flow-paper-drop'&&Math.hypot(X-(id==='flow-near-colors'?552:632),Y-512)<26
  if(id!=='flow-water-only'&&(blue||yellow)){rgba[p]=blue?171:0;rgba[p+1]=blue?90:14;rgba[p+2]=yellow?171:0;rgba[p+3]=180}
 }
 return{size,rgba,water,paper,seed:805,encoding:'optical-density'}
}

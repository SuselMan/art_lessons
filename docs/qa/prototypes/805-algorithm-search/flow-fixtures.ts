import {paperBytes} from './fixtures'
import {stressFlowIds,createStressFlowFixture} from './stress-flow-fixtures'
import type {AlgorithmInput} from './protocol'
export const flowIds=['flow-pool-drop','flow-separated-colors','flow-dry-barrier','flow-isolated-pools','flow-one-pixel-wall','flow-thin-neck','flow-paper-drop','flow-water-only','flow-dry-pigment','flow-near-colors','flow-diagonal-wall','dynamic-wet-on-dry','dynamic-water-drop','dynamic-stroke-through-pool','dynamic-two-strokes','dynamic-opaque-stationary','dynamic-saturated-pigment','dynamic-corner-wetting','dynamic-stroke-through-pool-w64','dynamic-stroke-through-pool-w128','dynamic-stroke-through-pool-w255','dynamic-stroke-through-pool-soft',...stressFlowIds] as const
export function createFlowFixture(id:string,size=1024):AlgorithmInput{
 if(stressFlowIds.includes(id as any))return createStressFlowFixture(id,size)
 if(!flowIds.includes(id as any))throw Error('Unknown flow fixture '+id)
 const dynamic=id.startsWith('dynamic-')
 const rgba=new Uint8Array(size*size*4),water=new Uint8Array(size*size),paper=(id==='flow-paper-drop'||id.startsWith('dynamic-stroke-through-pool')||id==='dynamic-two-strokes')?paperBytes(size):new Uint8Array(size*size).fill(128)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const X=x*1024/size,Y=y*1024/size,i=y*size+x,p=i*4
  if(id==='dynamic-opaque-stationary'||id==='dynamic-saturated-pigment'||id==='dynamic-corner-wetting'){
   const corner=id==='dynamic-corner-wetting',cx=corner?12:512,cy=corner?12:512,r=Math.hypot(X-cx,Y-cy)
   const saturated=id==='dynamic-saturated-pigment',opaque=id==='dynamic-opaque-stationary'&&X>=511&&X<513&&Y>=511&&Y<513
   water[i]=opaque?0:r<(corner?50:180)?(saturated?255:180):0
   const pigment=corner?r<40:saturated?r<140:Math.abs(Y-512)<16&&X>=380&&X<644
   if(pigment){const alpha=saturated?255:180;rgba[p]=Math.floor(alpha*171/180);rgba[p+1]=Math.floor(alpha*90/180);rgba[p+3]=alpha}
   if(opaque){rgba[p]=32;rgba[p+1]=32;rgba[p+2]=32;rgba[p+3]=255}
   continue
  }
  if(id.startsWith('dynamic-stroke-through-pool')||id==='dynamic-two-strokes'){
   const inLine=X>=200&&X<824&&Math.abs(Y-512)<12
   const blue=id.startsWith('dynamic-stroke-through-pool')?inLine:Math.abs(X-464)<12&&Y>=340&&Y<684
   const yellow=id==='dynamic-two-strokes'&&Math.abs(X-560)<12&&Y>=340&&Y<684
   const poolW=id.endsWith('-w64')?64:id.endsWith('-w128')?128:id.endsWith('-w255')?255:200
   const lineW=id==='dynamic-stroke-through-pool'?100:32,radius=Math.hypot(X-512,Y-512),t=Math.max(0,Math.min(1,(220-radius)/80)),pool=id.endsWith('-soft')?Math.round(poolW*t*t*(3-2*t)):radius<180?poolW:0
   water[i]=id.startsWith('dynamic-stroke-through-pool')?Math.max(inLine?lineW:0,pool):(Math.hypot(X-512,Y-512)<220?180:0)
   if(blue||yellow){rgba[p]=blue?171:0;rgba[p+1]=blue?90:14;rgba[p+2]=yellow?171:0;rgba[p+3]=180}
   continue
  }
  let wet=(id==='flow-pool-drop'||id==='flow-paper-drop')?Math.hypot(X-512,Y-512)<320:X>=190&&X<834&&Y>=310&&Y<714
  if(id==='flow-dry-barrier'&&Math.abs(X-512)<2)wet=false
  if(id==='flow-diagonal-wall'&&Math.floor(X)+Math.floor(Y)===1024)wet=false
  if(id==='flow-one-pixel-wall'&&Math.floor(X)===513)wet=false
  if(id==='flow-thin-neck')wet=Math.hypot(X-360,Y-512)<140||Math.hypot(X-664,Y-512)<140||(X>=360&&X<=664&&Y>=506&&Y<=518)
  if(id==='flow-isolated-pools')wet=Math.hypot(X-360,Y-512)<140||Math.hypot(X-664,Y-512)<140
  if(id==='dynamic-wet-on-dry')wet=Math.hypot(X-512,Y-512)<70
  if(id==='dynamic-water-drop')wet=Math.hypot(X-512,Y-512)<150
  water[i]=id==='flow-dry-pigment'?0:wet?180:0
  if(id==='dynamic-water-drop')water[i]=wet?(Math.hypot(X-512,Y-512)<30?210:35):0
  const blue=Math.hypot(X-(dynamic?512:(id==='flow-pool-drop'||id==='flow-paper-drop')?512:id==='flow-near-colors'?472:392),Y-512)<(id==='dynamic-wet-on-dry'?60:id==='dynamic-water-drop'?150:26)
  const yellow=!dynamic&&id!=='flow-pool-drop'&&id!=='flow-paper-drop'&&Math.hypot(X-(id==='flow-near-colors'?552:632),Y-512)<26
  if(id!=='flow-water-only'&&(blue||yellow)){rgba[p]=blue?171:0;rgba[p+1]=blue?90:14;rgba[p+2]=yellow?171:0;rgba[p+3]=180}
 }
 return{size,rgba,water,paper,seed:805,encoding:'optical-density'}
}

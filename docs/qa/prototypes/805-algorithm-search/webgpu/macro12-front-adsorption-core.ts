import type {IntegerWetCell} from './macro10-wetness-core'
/** Extra M->D ONLY. No water/pigment creation or final-color multiplier. */
export function frontDeposit(cell:IntegerWetCell,old:IntegerWetCell,highestWater:number,edgeStain:number){
 if(!Number.isInteger(edgeStain)||edgeStain<0||edgeStain>128)throw Error('edgeStain0..128')
 const c={...cell,m:cell.m.slice(),d:cell.d.slice()}
 if(c.w===0||highestWater<=old.w||old.w>=2048||edgeStain===0)return c
 const front=Math.floor((highestWater-old.w)*256/Math.max(highestWater,1)),dry=Math.floor((old.absCap-old.s)*256/old.absCap),affinity=128+Math.floor((255-old.paper)/2)
 let strength=Math.floor(edgeStain*front/256);strength=Math.floor(strength*(2048-old.w)/2048);strength=Math.floor(strength*dry/256);strength=Math.floor(strength*affinity/256)
 const alpha=Math.floor((c.m[3]*strength+128)/256),den=Math.max(c.m[3],1)
 for(let k=0;k<4;k++){const amount=k===3?alpha:Math.floor((c.m[k]*alpha+Math.floor(den/2))/den);c.m[k]-=amount;c.d[k]+=amount}
 return c
}
export function highWater(state:IntegerWetCell[],n:number,index:number){const x=index%n,y=Math.floor(index/n);let high=state[index].w;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<n&&Y<n)high=Math.max(high,state[Y*n+X].w)}return high}

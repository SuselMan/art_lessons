/** Independent bounded Q8 min-plus graph oracle. Explicit supplied constant edge
 * costs; no paper/noise/sampler emulation and no actual shader equality claim. */
export function scalarFrontStep(old,w,h,axisCost=2,diagonalCost=3){
 if(old.length!==w*h||!Number.isInteger(axisCost)||!Number.isInteger(diagonalCost)||axisCost<0||diagonalCost<0)throw Error('Q8 oracle inputs')
 const out=old.slice(),dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let d=0;d<8;d++){
  const nx=x+dirs[d][0],ny=y+dirs[d][1];if(nx<0||ny<0||nx>=w||ny>=h)continue
  const donor=old[ny*w+nx];if(donor===255)continue
  out[y*w+x]=Math.min(out[y*w+x],255,donor+(d<4?axisCost:diagonalCost))
 }
 return out
}
export function scalarFrontStats(old,next){let changed=0,gained=0,rose=0,reached=0,saturated=0;for(let i=0;i<old.length;i++){if(old[i]!==next[i])changed++;if(old[i]===255&&next[i]<255)gained++;if(next[i]>old[i])rose++;if(next[i]<255)reached++;else saturated++}return{changed,gained,rose,reached,saturated}}

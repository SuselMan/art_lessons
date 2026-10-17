export const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const
/** Exact run length of positive raw water; diagonals include both corner cells.
 * Capped255 is sufficient for every admitted radius≤127. O(8N), no GPU work. */
export function pathDistances(water:Uint8Array,size:number){
 if(!Number.isInteger(size)||size<1||size>1024||water.length!==size*size)throw Error('path dimensions')
 const axial=new Uint8Array(water.length*4),diagonal=new Uint8Array(water.length*4)
 for(let d=0;d<8;d++){
  const [dx,dy]=directions[d],target=d<4?axial:diagonal,c=d%4
  for(let yy=0;yy<size;yy++)for(let xx=0;xx<size;xx++){
   const x=dx>0?size-1-xx:xx,y=dy>0?size-1-yy:yy,i=y*size+x,nx=x+dx,ny=y+dy
   if(!water[i]||nx<0||ny<0||nx>=size||ny>=size||!water[ny*size+nx])continue
   if(dx&&dy&&(!water[y*size+nx]||!water[ny*size+x]))continue
   target[i*4+c]=Math.min(255,target[(ny*size+nx)*4+c]+1)
  }
 }
 return{axial,diagonal}
}
export function denseKernel(radius=24,sigma=12){
 if(!Number.isInteger(radius)||radius<1||radius>32||!Number.isFinite(sigma)||sigma<1||sigma>32)throw Error('dense kernel')
 const taps:{dx:number;dy:number;r:number;weight:number}[]=[];let sum=0
 for(const[dx,dy]of directions)for(let r=1;r<=Math.floor(radius/Math.hypot(dx,dy));r++){const weight=r*(dx*dx+dy*dy)*Math.exp(-.5*r*r*(dx*dx+dy*dy)/(sigma*sigma));taps.push({dx,dy,r,weight});sum+=weight}
 return taps.map(t=>({...t,weight:t.weight*.75/sum}))
}

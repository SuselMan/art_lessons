/** Keep connected optical regions above the world-area threshold on a rectangular grid. */
export function retainedComponents(bytes:Uint8Array,width:number,height:number,minCells:number):Uint8Array {
 const seen=new Uint8Array(width*height),keep=new Uint8Array(width*height*4),queue=new Int32Array(width*height)
 for(let first=0;first<width*height;first++){
  if(seen[first]||bytes[first*4]<6)continue
  let head=0,tail=1;queue[0]=first;seen[first]=1
  while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width)
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue
    const xx=x+dx,yy=y+dy
    if(xx<0||xx>=width||yy<0||yy>=height)continue
    const k=yy*width+xx
    if(!seen[k]&&bytes[k*4]>=6){seen[k]=1;queue[tail++]=k}
   }
  }
  if(tail>=minCells)for(let i=0;i<tail;i++)keep.fill(bytes[queue[i]*4],queue[i]*4,queue[i]*4+4)
 }
 if(minCells===0)for(let i=0;i<width*height;i++)keep.fill(bytes[i*4],i*4,i*4+4)
 return keep
}

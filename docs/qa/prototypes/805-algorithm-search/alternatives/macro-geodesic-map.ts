/** An involution made from endpoint visits on a real wet DFS walk.
 * Matched endpoint distance is bounded by WALK length, hence by a valid wet path.
 * This is nonlocal mixing along that path, not a local fluid trajectory. */
export function geodesicPairs(water:Uint8Array,size:number,minDistance:number,maxDistance:number,variant=0){
 if(water.length!==size*size||!Number.isInteger(size)||size<1||size>1024||!Number.isInteger(minDistance)||!Number.isInteger(maxDistance)||minDistance<1||maxDistance<minDistance)throw Error('geodesic pair dimensions/radius')
 const n=water.length,pairs=new Int32Array(n),seen=new Uint8Array(n),assigned=new Uint8Array(n),stack=new Int32Array(n),next=new Uint8Array(n),last=new Int32Array(n),queue=new Int32Array(n*2+1),times=new Int32Array(n*2+1)
 last.fill(-1);for(let i=0;i<n;i++)pairs[i]=i
 let time=0,head=0,tail=0,matched=0,maxWalk=0,walkSum=0
 const dirs=variant%2===0?[[1,0],[0,1],[-1,0],[0,-1]]:[[0,1],[1,0],[0,-1],[-1,0]]
 function visit(id:number){
  time++
  while(head<tail&&(assigned[queue[head]]||last[queue[head]]!==times[head]||time-times[head]>maxDistance))head++
  if(assigned[id])return
  if(head<tail&&queue[head]!==id&&time-times[head]>=minDistance){const other=queue[head],distance=time-times[head++];pairs[id]=other;pairs[other]=id;assigned[id]=assigned[other]=1;matched+=2;maxWalk=Math.max(maxWalk,distance);walkSum+=distance;return}
  if(last[id]<0||time-last[id]>maxDistance){if(tail>=queue.length)throw Error('geodesic walk queue overflow');queue[tail]=id;times[tail++]=time;last[id]=time}
 }
 for(let start=0;start<n;start++)if(water[start]>0&&!seen[start]){
  head=tail=0;let depth=0;stack[0]=start;next[0]=0;seen[start]=1;visit(start)
  while(depth>=0){const id=stack[depth];if(next[depth]>=4){depth--;if(depth>=0)visit(stack[depth]);continue}const d=dirs[(next[depth]+++variant)%4],x=id%size+d[0],y=Math.floor(id/size)+d[1];if(x<0||y<0||x>=size||y>=size)continue;const other=y*size+x;if(!water[other]||seen[other])continue;depth++;stack[depth]=other;next[depth]=0;seen[other]=1;visit(other)}
 }
 const bytes=new Uint8Array(n*4);for(let i=0;i<n;i++){const x=pairs[i]%size,y=Math.floor(pairs[i]/size);bytes[i*4]=x>>>8;bytes[i*4+1]=x&255;bytes[i*4+2]=y>>>8;bytes[i*4+3]=y&255}
 return{pairs,bytes,matchedPixels:matched,maxWalkDistance:maxWalk,meanMatchedWalkDistance:matched?walkSum/(matched/2):0}
}

/** Keep the material arithmetic literal, compute each disjoint pair once.
 * Host dispatch may remain 128x128: threads x>64 return before any state reads.
 * Offset-one phases use two singleton edge tasks; every destination written once.
 */
export function singlePairSource(source:string){
 const start='@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){'
 const marker='let ia=min(i,j);let ib=max(i,j);'
 const end='if(i==ia){dst[i]=adsorb(a,aux[ia]);}else{dst[i]=adsorb(b,aux[ib]);}'
 if(source.split(start).length!==2||source.split(marker).length!==2||source.split(end).length!==2)throw Error('Single-pair source anchors drifted')
 const arithmetic=source.slice(source.indexOf(marker)+marker.length,source.indexOf(end))
 return source.slice(0,source.indexOf(start))+start+`
 if(gid.y>=p.n||gid.x>p.n/2u){return;}
 let axis=p.phase%2u;let offset=p.phase/2u;
 let first=2*i32(gid.x)-i32(offset);let second=first+1;
 if(second<0||first>=i32(p.n)){return;}
 if(first<0||second>=i32(p.n)){
  let coord=u32(clamp(first,0,i32(p.n)-1));
  let i=select(gid.y*p.n+coord,coord*p.n+gid.y,axis==1u);
  dst[i]=adsorb(src[i],aux[i]);return;
 }
 let ia=select(gid.y*p.n+u32(first),u32(first)*p.n+gid.y,axis==1u);
 let ib=select(gid.y*p.n+u32(second),u32(second)*p.n+gid.y,axis==1u);
 `+arithmetic+`dst[ia]=adsorb(a,aux[ia]);dst[ib]=adsorb(b,aux[ib]);\n}`
}
export function pairTasks(n:number,phase:number){
 if(n%2||phase<0||phase>3)throw Error('Pair mapping range')
 const tasks:number[][]=[];const axis=phase%2,offset=phase>>1
 for(let line=0;line<n;line++)for(let j=0;j<=n/2;j++){
  const first=2*j-offset,second=first+1;if(second<0||first>=n)continue
  const index=(c:number)=>axis?c*n+line:line*n+c
  tasks.push(first<0||second>=n?[index(Math.max(0,Math.min(n-1,first)))]:[index(first),index(second)])
 }
 return tasks
}

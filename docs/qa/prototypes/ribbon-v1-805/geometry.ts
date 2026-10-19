import {nibGeometry,nibSupport,outlinePoints} from '../../../../apps/web/src/engine/src/dabs/markerRibbon'
export type RibbonPoint805={dab:any;dose:number;water:number;along:number}
/** One continuous across-brush coordinate; endpoint caps only, no stamp grid. */
export function ribbonMesh805(points:RibbonPoint805[],multiplier:number,shape:any='ellipse',corner=0){
 const out:number[]=[],n=points.length;if(!n)return new Float32Array()
 const tangents=points.map((p,i)=>{const a=points[Math.max(0,i-1)].dab,b=points[Math.min(n-1,i+1)].dab,dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);return l>1e-6?[dx/l,dy/l]:[Math.cos(p.dab.angle??0),Math.sin(p.dab.angle??0)]})
 const cross=points.map((p,i)=>{const[tX,tY]=tangents[i],nx=-tY,ny=tX,g=nibGeometry(p.dab,multiplier,shape,corner),left=nibSupport(g,nx,ny),right=nibSupport(g,-nx,-ny);return{g,nx,ny,left:{x:p.dab.x+left.x,y:p.dab.y+left.y},right:{x:p.dab.x+right.x,y:p.dab.y+right.y},width:Math.max(left.value,right.value,1)}})
 function vertex(x:number,y:number,edge:number,v:number,p:RibbonPoint805){out.push(x,y,edge,p.dose,p.water,v,p.along,0,0,1,0)}
 function tri(a:[number,number,number,number,RibbonPoint805],b:typeof a,c:typeof a){vertex(...a);vertex(...b);vertex(...c)}
 for(let i=0;i<n-1;i++){const a=points[i],b=points[i+1],ca=cross[i],cb=cross[i+1];for(const side of ['left','right'] as const){const v=side==='left'?1:-1,A:[number,number,number,number,RibbonPoint805]=[a.dab.x,a.dab.y,ca.width,0,a],B:typeof A=[b.dab.x,b.dab.y,cb.width,0,b],L:typeof A=[ca[side].x,ca[side].y,0,v,a],R:typeof A=[cb[side].x,cb[side].y,0,v,b];tri(A,L,R);tri(A,R,B)}}
 // Elliptical endpoint bodies share the strip's affine across-coordinate.
 for(const i of n===1?[0]:[0,n-1]){const p=points[i],c=cross[i],rim=outlinePoints(c.g,0,32),core=outlinePoints(c.g,Math.min(1,c.g.semiMinor*.4),32),center:[number,number,number,number,RibbonPoint805]=[p.dab.x,p.dab.y,c.width,0,p];const vert=(q:any,edge:number):typeof center=>[p.dab.x+q.x,p.dab.y+q.y,edge,Math.max(-1,Math.min(1,(q.x*c.nx+q.y*c.ny)/c.width)),p];for(let j=0;j<32;j++){const k=(j+1)%32;tri(vert(rim[j],0),vert(rim[k],0),vert(core[k],1));tri(vert(rim[j],0),vert(core[k],1),vert(core[j],1));tri(center,vert(core[j],1),vert(core[k],1))}}
 return new Float32Array(out)
}

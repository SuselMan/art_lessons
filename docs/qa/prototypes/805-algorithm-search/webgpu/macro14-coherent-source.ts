import {mobilitySource} from './macro13-mobility-calibration'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Coherent source drift');return s.replace(a,b)}
export function coherentSource(gain:number){
 const helper=`
fn psiVertex(x:u32,y:u32)->i32{if(x==0u||y==0u||x==p.n||y==p.n){return 0;}return i32(aux[y*p.n+x].w)-32768;}
fn streamFace(a:u32,b:u32)->i32{let x=a%p.n;let y=a/p.n;if(b-a==1u){return psiVertex(x+1u,y+1u)-psiVertex(x+1u,y);}return psiVertex(x,y+1u)-psiVertex(x+1u,y+1u);}
`
 let s=once(mobilitySource(gain),'fn head(',helper+'fn head(')
 s=once(s,'let fromA=ha>hb;','let pressureFromA=ha>hb;')
 s=once(s,'if(fromA){donor=a;receiver=b;}','if(pressureFromA){donor=a;receiver=b;}')
 s=once(s,'let q=(q0*meanW+32767u)/65535u;let cap=',`let pressureQ=(q0*meanW+32767u)/65535u;
 let rate=streamFace(ia,ib);let upwind=select(b.w,a.w,rate>=0);let curl0=(upwind*u32(abs(rate))+256u)/512u;
 let curlWet=min(((a.w+b.w)/2u)*${gain}u,16384u);let curlQ=(curl0*curlWet+8192u)/16384u;
 let combined=select(-i32(pressureQ),i32(pressureQ),pressureFromA)+select(-i32(curlQ),i32(curlQ),rate>=0);
 let fromA=combined>0;donor=b;receiver=a;if(fromA){donor=a;receiver=b;}
 let q=min(min(u32(abs(combined)),donor.w*4u/5u),65535u-receiver.w);let cap=`)
 return s
}

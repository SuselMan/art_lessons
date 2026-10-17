/** CPU reference for local hydraulic pair splitting and bounded residual detail. */
export function pairStep(a:number[],b:number[],wa:number,wb:number,pa:number,pb:number,cap=52428,dt=.35,diffusion=.2,headGain=6){
 const ac=a.slice(),bc=b.slice()
 for(let c=0;c<4;c++){const d=bc[c]-ac[c],transfer=Math.sign(d)*Math.floor(Math.abs(d)*diffusion+.5);ac[c]+=transfer;bc[c]-=transfer}
 const ha=wa+headGain*pa,hb=wb+headGain*pb,donorA=ha>hb,dw=donorA?wa:wb,rw=donorA?wb:wa,perm=.6+.4*(1-Math.max(pa,pb)/255)
 const q=Math.max(0,Math.min(Math.floor(Math.abs(ha-hb)*dt*perm+.5),Math.floor(dw*.8),65535-rw))
 const donor=donorA?ac:bc,receiver=donorA?bc:ac,alpha=Math.max(0,Math.min(Math.floor(donor[3]*q/Math.max(dw,1)+.5),cap-receiver[3]))
 for(let c=0;c<4;c++){const amount=c===3?alpha:Math.floor(donor[c]*alpha/Math.max(donor[3],1)+.5);donor[c]-=amount;receiver[c]+=amount}
 return{a:ac,b:bc,wa:wa+(donorA?-q:q),wb:wb+(donorA?q:-q),q}
}
/** A SINGLE k for all pixels/channels in a cell preserves zero-sum residual.
 * Fixed is (1-f)*raw. Final mobile mean is capacity-limited to f. */
export function boundedResidual(raw:number[][],initial:number[],final:number[],f=.8){
 let k=1
 for(const p of raw){
  for(let c=0;c<4;c++){const base=(1-f)*p[c]+final[c],residual=f*p[c]-initial[c];if(residual<0)k=Math.min(k,base/-residual);if(residual>0)k=Math.min(k,(1-base)/residual)}
  for(let c=0;c<3;c++){const base=(1-f)*(p[3]-p[c])+final[3]-final[c],residual=f*(p[3]-p[c])-(initial[3]-initial[c]);if(residual<0)k=Math.min(k,base/-residual)}
 }
 k=Math.max(0,Math.min(1,k));return{k,pixels:raw.map(p=>p.map((v,c)=>(1-f)*v+final[c]+k*(f*v-initial[c])))}
}

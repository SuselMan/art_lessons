export type FootprintPoint805={dab:any;dose:number;water:number;along:number}
/** Streaming fixed nib: emitted footprints never depend on future input. */
export class FootprintStream805{
 private previous:FootprintPoint805|null=null
 private untilNext=0
 private spacing=1
 private angle=0
 private aspect=1
 append(input:FootprintPoint805[],multiplier:number){
  const out:number[]=[]
  const emit=(p:FootprintPoint805,initial=false)=>{
   const minor=Math.max(.25,p.dab.size*.5*multiplier),major=minor*this.aspect,c=Math.cos(this.angle),s=Math.sin(this.angle)
   // Dose per travelled distance; the first contact remains visible immediately.
   const dose=p.dose*(initial?.18:Math.min(1,this.spacing/(minor*1.35)))
   const vertex=(x:number,y:number)=>out.push(p.dab.x+c*x*major-s*y*minor,p.dab.y+s*x*major+c*y*minor,x,y,dose,p.water,p.dab.pressure??1,1/minor,p.along,0,0)
   for(const[x,y]of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]])vertex(x,y)
  }
  for(const p of input){
   if(!this.previous){this.angle=p.dab.angle??0;this.aspect=Math.max(1,p.dab.aspectRatio??1);this.spacing=Math.max(.6,p.dab.size*.5*multiplier*.12);this.untilNext=this.spacing;emit(p,true);this.previous=p;continue}
   const a=this.previous,dx=p.dab.x-a.dab.x,dy=p.dab.y-a.dab.y,length=Math.hypot(dx,dy)
   if(length>1e-8){let distance=this.untilNext;for(;distance<=length+1e-8;distance+=this.spacing){const t=Math.min(1,distance/length),mix=(x:number,y:number)=>x+(y-x)*t;emit({dab:{...p.dab,x:mix(a.dab.x,p.dab.x),y:mix(a.dab.y,p.dab.y),size:mix(a.dab.size,p.dab.size),pressure:mix(a.dab.pressure??1,p.dab.pressure??1)},dose:mix(a.dose,p.dose),water:mix(a.water,p.water),along:mix(a.along,p.along)})}this.untilNext=distance-length}
   this.previous=p
  }
  return new Float32Array(out)
 }
}

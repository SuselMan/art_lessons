import type { WaterFootprint } from '../../../../apps/web/src/engine/src/watercolor/foreignWater'
export type WetComponent={id:number;cells:Set<number>;contacts:WaterFootprint[];wet:number;pending:boolean}
/** Coarse topology/dose bookkeeping only. Does not resample paint. */
export class WetComponents {
 readonly side:number
 readonly density:Float32Array
 readonly components:WetComponent[]=[]
 private next=1
 constructor(readonly size:number,readonly cell=8){this.side=Math.ceil(size/cell);this.density=new Float32Array(this.side*this.side)}
 reset(){this.components.length=0;this.density.fill(0)}
 add(contacts:readonly WaterFootprint[],dose:number){
  const cells=new Set<number>(),n=this.side,s=this.cell
  for(const d of contacts){const rx=Math.max(.5,d.radius*Math.max(1,d.aspect)),ry=Math.max(.5,d.radius),extent=Math.max(rx,ry)+s,c=Math.cos(d.angle),sin=Math.sin(d.angle)
   for(let y=Math.max(0,Math.floor((d.y-extent)/s));y<Math.min(n,Math.ceil((d.y+extent)/s));y++)for(let x=Math.max(0,Math.floor((d.x-extent)/s));x<Math.min(n,Math.ceil((d.x+extent)/s));x++){
    const dx=(x+.5)*s-d.x,dy=(y+.5)*s-d.y,u=(dx*c+dy*sin)/(rx+s*.5),v=(-dx*sin+dy*c)/(ry+s*.5)
    if(u*u+v*v<=1)cells.add(y*n+x)
   }
  }
  const touching=(other:Set<number>)=>{for(const key of cells){const x=key%n,y=Math.floor(key/n);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<n&&y+dy>=0&&y+dy<n&&other.has((y+dy)*n+x+dx))return true}return false}
  const joined=this.components.filter(c=>touching(c.cells)),all=new Set(cells)
  for(const c of joined)for(const key of c.cells)all.add(key)
  for(const key of cells)this.density[key]+=Math.max(0,Math.min(1,dose))
  let mass=0;for(const key of all)mass+=this.density[key]
  const component:WetComponent={id:this.next++,cells:all,contacts:[...joined.flatMap(c=>c.contacts),...contacts.map(d=>({...d}))],wet:Math.min(1,mass/Math.max(1,all.size)),pending:true}
  for(const c of joined)this.components.splice(this.components.indexOf(c),1)
  this.components.push(component)
  return {component,joined:joined.map(c=>c.id)}
 }
}

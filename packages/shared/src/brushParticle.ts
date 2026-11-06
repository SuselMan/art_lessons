export interface BrushParticle{version:1;count:number;iterations:number;gravity:number;weight:number;scaleX:number;scaleY:number}
export function isBrushParticle(v:unknown):v is BrushParticle{
 if(!v||typeof v!=='object'||Array.isArray(v))return false
 const p=v as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(p).every(k=>['version','count','iterations','gravity','weight','scaleX','scaleY'].includes(k))&&p.version===1&&Number.isInteger(p.count)&&n(p.count,1,500)&&Number.isInteger(p.iterations)&&n(p.iterations,1,200)&&(p.count as number)*(p.iterations as number)<=16384&&n(p.gravity,0,1)&&n(p.weight,0,1)&&n(p.scaleX,0,2)&&n(p.scaleY,0,2)
}
export function isParticleDescriptor(d:Record<string,unknown>):boolean{
 if(d.particle===undefined)return true
 const b=d.behavior,t=d.tip,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 return isBrushParticle(d.particle)&&d.model==='stamp'&&['mixer','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(t)&&t.kind==='round'&&t.profile===undefined&&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'
}

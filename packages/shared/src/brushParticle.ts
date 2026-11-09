export interface BrushParticle{version:1;count:number;iterations:number;gravity:number;weight:number;scaleX:number;scaleY:number}
export function isBrushParticle(v:unknown):v is BrushParticle{
 if(!v||typeof v!=='object'||Array.isArray(v))return false
 const p=v as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(p).every(k=>['version','count','iterations','gravity','weight','scaleX','scaleY'].includes(k))&&p.version===1&&Number.isInteger(p.count)&&n(p.count,1,500)&&Number.isInteger(p.iterations)&&n(p.iterations,1,200)&&(p.count as number)*(p.iterations as number)<=16384&&n(p.gravity,0,1)&&n(p.weight,0,1)&&n(p.scaleX,0,2)&&n(p.scaleY,0,2)
}
export function isParticleDescriptor(d:Record<string,unknown>):boolean{
 if(d.particle===undefined)return true
 const b=d.behavior,t=d.tip,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(record(b)&&record(b.rendering)&&b.rendering.accumulation==='alphaDarken')return hasParticleWash134Scope(d)
 return isBrushParticle(d.particle)&&d.model==='stamp'&&['mixer','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(t)&&t.kind==='round'&&t.aspect===1&&t.profile===undefined&&record(b)&&b.version===2&&b.dual===undefined&&(b.timing===undefined||hasParticleTimer157Scope(d))&&b.wetMix===undefined&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'
}

/** New native Particle request Wash. Whole library still validates every field. */
export function hasParticleWash134Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!isBrushParticle(value.particle))return false
 const t=value.tip,b=value.behavior,r=b.rendering
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 return Number.isInteger(value.version)&&Number(value.version)>=134&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&one(value.flowByPressure)&&one(value.opacityByPressure)
 &&['mixer','spray','bristle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx'].every(k=>value[k]===undefined)
 &&t.kind==='round'&&t.aspect===1&&t.hardness===1&&t.rotation==='fixed'&&t.angle===0&&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering'].includes(k))&&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}

/** Closed ordinary Particle timer; whole library validates the remaining descriptor schema. */
export function hasParticleTimer157Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!isBrushParticle(value.particle))return false
 const t=value.tip,b=value.behavior,r=b.rendering,c=b.timing
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 return Number.isInteger(value.version)&&Number(value.version)>=157&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&value.flowPer==='stamp'&&one(value.flowByPressure)&&one(value.opacityByPressure)
 &&['mixer','spray','bristle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx'].every(k=>value[k]===undefined)
 &&t.kind==='round'&&t.aspect===1&&t.hardness===1&&t.rotation==='fixed'&&t.angle===0&&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering','timing'].includes(k))&&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
 &&obj(c)&&Object.keys(c).every(k=>['version','rate','ignoreDistanceSpacing'].includes(k))&&c.version===1&&typeof c.rate==='number'&&Number.isFinite(c.rate)&&c.rate>0&&c.rate<=1000&&c.ignoreDistanceSpacing===false
}

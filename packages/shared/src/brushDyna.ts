/** Bounded original DynaDraw circle mode; all other actions remain unsupported. */
export interface BrushDyna{version:1;mass:number;drag:number;diameter:number}
export function hasDyna210Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),n=(v:unknown,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b,one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&n(p[0],0,1)&&p[1]===1)
 if(!obj(value)||value.version!==210||!obj(value.dyna)||!obj(value.tip)||!obj(value.behavior))return false
 const d=value.dyna,t=value.tip,b=value.behavior,r=b.rendering
 return Object.keys(d).every(k=>['version','mass','drag','diameter'].includes(k))&&d.version===1&&n(d.mass,0,1)&&n(d.drag,0,1)&&Number.isInteger(d.diameter)&&n(d.diameter,3,32)
 &&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&value.opacity===1&&one(value.sizeByPressure)&&one(value.flowByPressure)&&one(value.opacityByPressure)
 &&['mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].every(k=>value[k]===undefined)
 &&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))&&t.kind==='round'&&t.hardness===1&&t.aspect===1&&t.rotation==='fixed'&&t.angle===0
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering'].includes(k))&&obj(r)&&Object.keys(r).every(k=>['mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode'].includes(k))&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&r.wetEdges===0&&r.burntEdges===0&&r.burntEdgesMode==='multiply'
}

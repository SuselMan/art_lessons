/** Closed authored Pixel gradient/Wash. Captured palette uses existing100 resources. */
export function hasPixelGradientWash138Scope(value:unknown):boolean {
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 const asset=(v:unknown)=>typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior))return false
 const t=value.tip,b=value.behavior,c=t.color,r=b.rendering
 if(!obj(c)||Object.keys(c).length!==1||!obj(c.gradient))return false
 const g=c.gradient
 return Number.isInteger(value.version)&&Number(value.version)>=138&&value.model==='stamp'&&value.paperInteraction===0
 &&['mypaint','clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mixer','wet','texture','scatter','tangentNormal'].every(k=>value[k]===undefined)
 &&t.kind==='bitmap'&&asset(t.mask)&&Object.keys(t).every(k=>['kind','mask','maskBounds','hardness','aspect','rotation','angle','color'].includes(k))
 &&Object.keys(g).every(k=>['gray','sampling'].includes(k))&&asset(g.gray)&&g.sampling==='filteredGray-v1'
 &&b.version===2&&Object.keys(b).every(k=>['version','speedInput','rendering','spacing','rotation','mirror','modulations','dynamics','strokeInput'].includes(k))
 &&(b.modulations===undefined||obj(b.modulations)&&Object.keys(b.modulations).every(k=>['size','opacity','angle'].includes(k)))
 &&(b.dynamics===undefined||obj(b.dynamics)&&Object.keys(b.dynamics).every(k=>['size','opacity','angle'].includes(k)))
 &&(b.strokeInput===undefined||obj(b.strokeInput)&&b.strokeInput.fanCorners===undefined)
 &&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}

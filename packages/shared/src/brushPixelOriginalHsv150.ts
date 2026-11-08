/** Native IMAGESTAMP ignores transformed foreground; controls still execute normally. */
export function hasPixelOriginalHsv150Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!obj(v.tip)||!obj(v.behavior)||!obj(v.tip.color))return false
 const t=v.tip,b=v.behavior,c=t.color,r=b.rendering
 if(!obj(c))return false
 return Number.isInteger(v.version)&&Number(v.version)>=150&&v.model==='stamp'&&v.paperInteraction===0
 &&['mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].every(k=>v[k]===undefined)
 &&t.kind==='bitmap'&&typeof t.mask==='string'&&Object.keys(t).every(k=>['kind','mask','maskBounds','hardness','aspect','rotation','angle','color'].includes(k))
 &&c.adjustmentPolicy==='native-image-stamp-v1'&&Object.keys(c).every(k=>['planes','adjustmentPolicy'].includes(k))&&Array.isArray(c.planes)&&c.planes.length===3&&c.planes.every(x=>typeof x==='string'&&/^asset:[a-f0-9]{64}$/.test(x))
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering','spacing','rotation','mirror','modulations','dynamics','strokeInput','speedInput','colorAdjustment'].includes(k))
 &&obj(b.colorAdjustment)&&Object.keys(b.colorAdjustment).length>0&&Object.keys(b.colorAdjustment).every(k=>['hue','saturation','value'].includes(k))
 &&['dynamics','modulations'].every(k=>{const x=b[k];return x===undefined||obj(x)&&['hue','saturation','brightness'].every(h=>x[h]===undefined)})
 &&obj(r)&&r.mode==='buildUp'&&r.accumulation==='directOver'&&r.blendMode==='normal'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}

import{hasPixelOriginalHsv150Scope}from'./brushPixelOriginalHsv150.js'
/** Native colour stroke + independent accumulated ordinary alpha mask. */
export function hasPixelOriginalDual151Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!obj(v.tip)||!obj(v.behavior))return false
 const t=v.tip,b=v.behavior,d=b.dual,c=t.color
 if(!obj(c)||!obj(d)||!obj(d.brush)||!obj(d.brush.tip)||!obj(d.brush.behavior))return false
 const child=d.brush,ct=child.tip,cb=child.behavior
 if(!obj(ct)||!obj(cb))return false
 const rootKeys=['version','rendering','spacing','rotation','mirror','modulations','dynamics','strokeInput','speedInput','colorAdjustment','dual']
 const childKeys=rootKeys.filter(k=>!['dual','colorAdjustment'].includes(k))
 const ordinary=(x:Record<string,unknown>,mask=false)=>x.version===2&&obj(x.rendering)&&x.rendering.mode==='buildUp'&&(x.rendering.accumulation==='directOver'||mask&&x.rendering.accumulation==='alphaDarken')&&x.rendering.blendMode==='normal'&&(x.rendering.wetEdges??0)===0&&(x.rendering.burntEdges??0)===0&&!x.rendering.gammaCorrect&&!x.rendering.luminance
 const families=['mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal']
 if(!Number.isInteger(v.version)||Number(v.version)<151||v.model!=='stamp'||v.paperInteraction!==0||families.some(k=>v[k]!==undefined)||t.kind!=='bitmap'||typeof t.mask!=='string'||Object.keys(t).some(k=>!['kind','mask','maskBounds','hardness','aspect','rotation','angle','color'].includes(k))||!Array.isArray(c.planes)||c.planes.length!==3||!c.planes.every(x=>typeof x==='string'&&/^asset:[a-f0-9]{64}$/.test(x))||Object.keys(c).some(k=>!['planes','adjustmentPolicy'].includes(k))||Object.keys(b).some(k=>!rootKeys.includes(k))||!ordinary(b))return false
 if(c.adjustmentPolicy!==undefined||b.colorAdjustment!==undefined){const{dual:ignored,...rootBehavior}=b;void ignored;if(!hasPixelOriginalHsv150Scope({...v,behavior:rootBehavior}))return false}
 if(['dynamics','modulations'].some(k=>{const x=b[k];return obj(x)&&['hue','saturation','brightness'].some(h=>x[h]!==undefined)}))return false
 if(d.sampling!=='independent'||!['multiply','subtract','darken'].includes(String(d.blendMode))||Object.keys(d).some(k=>!['brush','sampling','blendMode'].includes(k)))return false
 if(child.model!=='stamp'||child.paperInteraction!==0||families.some(k=>child[k]!==undefined)||Object.keys(cb).some(k=>!childKeys.includes(k))||!ordinary(cb,true))return false
 if(['dynamics','modulations'].some(k=>{const x=cb[k];return obj(x)&&['hue','saturation','brightness'].some(h=>x[h]!==undefined)}))return false
 if(obj(cb.strokeInput)&&(cb.strokeInput.version!==1||cb.strokeInput.initialDirection!=='cursorHistory'||cb.strokeInput.fanCorners!==undefined))return false
 if(ct.kind==='bitmap')return typeof ct.mask==='string'&&Object.keys(ct).every(k=>['kind','mask','maskBounds','hardness','aspect','rotation','angle','imageSampling'].includes(k))
 if(ct.kind==='round')return ct.profile===undefined&&Object.keys(ct).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))
 return ct.kind==='procedural'&&obj(ct.profile)&&ct.profile.kind==='standard'&&ct.profile.shape==='ellipse'&&Object.keys(ct).every(k=>['kind','hardness','aspect','rotation','angle','profile'].includes(k))
}

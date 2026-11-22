/** Static Sharpness alignment for equal-size bitmap frames, root Pixel only. */
export function hasPixelAlignment211Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),n=(v:unknown,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b
 if(!obj(value)||value.version!==211||value.model!=='stamp'||value.paperInteraction!==0||!obj(value.tip)||!obj(value.behavior))return false
 const t=value.tip,b=value.behavior,q=t.alphaThreshold,r=b.rendering
 if(t.kind!=='bitmap'||t.aspect!==1||t.rotation!=='fixed'||!obj(q)||!obj(q.alignment)||!obj(r))return false
 const a=q.alignment,anim=t.animation
 return Object.keys(q).every(k=>['value','softness','alignment'].includes(k))&&n(q.value,0,1)&&n(q.softness,0,1)&&Object.keys(a).length===2&&n(a.width,1/2048,1)&&n(a.height,1/2048,1)&&Math.max(Number(a.width),Number(a.height))===1
 &&obj(anim)&&anim.mode==='random'&&Array.isArray(anim.frames)&&anim.frames.length>=2&&!('geometry'in anim)
 &&['color','material','imageSampling','profile','autoNoise','autoShape'].every(k=>t[k]===undefined)
 &&['mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','dyna','deform','filter','clone','mypaint','tangentNormal'].every(k=>value[k]===undefined)
 &&b.version===2&&Object.keys(b).every(k=>['version','speedInput','rendering','spacing','dynamics'].includes(k))&&(b.dynamics===undefined||obj(b.dynamics)&&Object.keys(b.dynamics).every(k=>k==='angle'))
 &&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0
}

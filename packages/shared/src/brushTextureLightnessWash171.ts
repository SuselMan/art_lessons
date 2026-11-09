import{isBrushBehavior}from'./brushBehavior.js'
/** Closed static opaque-foreground Lightness texture before ordinary Wash. */
export function hasTextureLightnessWash171Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 const asset=(x:unknown)=>typeof x==='string'&&/^asset:[a-f0-9]{64}$/.test(x)
 if(!obj(v)||!Number.isInteger(v.version)||Number(v.version)<171||v.model!=='stamp'||v.paperInteraction!==0||!obj(v.tip)||!obj(v.texture)||!obj(v.behavior))return false
 const t=v.tip,x=v.texture,b=v.behavior,r=b.rendering,m=x.material
 if(typeof x.strength!=='number'||!Number.isFinite(x.strength)||x.strength<0||x.strength>1||typeof x.periodPx!=='number'||!Number.isFinite(x.periodPx)||x.periodPx<1||x.periodPx>8192||!obj(x.patternSize)||!Number.isInteger(x.patternSize.width)||!Number.isInteger(x.patternSize.height)||Number(x.patternSize.width)<1||Number(x.patternSize.height)<1||Number(x.patternSize.width)>2048||Number(x.patternSize.height)>2048)return false
 if(t.kind!=='bitmap'||!asset(t.mask)||Object.keys(t).some(k=>!['kind','mask','maskBounds','hardness','aspect','rotation','angle'].includes(k))||!obj(m)||Object.keys(m).some(k=>!['kind','alpha'].includes(k))||m.kind!=='lightness'||!asset(m.alpha)||!asset(x.id)||x.application!==undefined||x.eraseId!==undefined)return false
 if(['mixer','spray','bristle','sketch','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','wet','scatter'].some(k=>v[k]!==undefined))return false
 if(b.version!==2||!isBrushBehavior(b)||Object.keys(b).some(k=>!['version','rendering','spacing','speedInput','dynamics','modulations'].includes(k))||!obj(r)||r.mode!=='buildUp'||r.blendMode!=='normal'||r.accumulation!=='alphaDarken'||(r.wetEdges??0)!==0||(r.burntEdges??0)!==0||r.gammaCorrect||r.luminance)return false
 const leaf=(c:unknown)=>obj(c)&&typeof c.control==='string'&&['pressure','off'].includes(c.control)&&c.jitter===0&&c.combine===undefined
 for(const[k,c]of Object.entries(obj(b.dynamics)?b.dynamics:{}))if(!['size','opacity','flow','grainDepth'].includes(k)||!leaf(c))return false
 for(const[k,cs]of Object.entries(obj(b.modulations)?b.modulations:{}))if(!['size','opacity','flow','grainDepth'].includes(k)||!Array.isArray(cs)||!cs.every(leaf))return false
 return true
}
export function assertTextureLightnessWash171Scope(v:unknown):boolean{
 const b=v as {model?:unknown;texture?:{material?:{kind?:unknown}};behavior?:{rendering?:{accumulation?:unknown}}}|null
 if(b?.model!=='stamp'||b.texture?.material?.kind!=='lightness'||b.behavior?.rendering?.accumulation!=='alphaDarken')return false
 if(!hasTextureLightnessWash171Scope(v))throw Error('Invalid Texture Lightness Wash171 scope')
 return true
}

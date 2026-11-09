import{isBrushBehavior}from'./brushBehavior.js'
/** Native masking-only alpha composite; not a layer/RGB blend mode. */
export function hasPixelAlphaDual168Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!Number.isInteger(v.version)||Number(v.version)<168||!obj(v.behavior)||!obj(v.behavior.dual))return false
 const dual=v.behavior.dual,child=dual.brush
 if(dual.blendMode!=='hardMixSofterPhotoshop'||dual.sampling!=='independent'||Object.keys(dual).some(k=>!['brush','blendMode','sampling'].includes(k))||!obj(child))return false
 const families=['mixer','spray','bristle','sketch','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','texture','wet','scatter']
 const leaf=(c:unknown)=>obj(c)&&typeof c.control==='string'&&['pressure','off'].includes(c.control)&&c.jitter===0&&c.combine===undefined
 const ordinary=(d:Record<string,unknown>,secondary=false)=>{
  if(d.model!=='stamp'||d.paperInteraction!==0||families.some(k=>d[k]!==undefined)||!obj(d.tip)||!obj(d.behavior))return false
  const t=d.tip,b=d.behavior,r=b.rendering
  if(Object.keys(b).some(k=>!['version','rendering','spacing','speedInput','dynamics','modulations',...(secondary?[]:['dual'])].includes(k))||!isBrushBehavior(b)||!obj(r)||r.mode!=='buildUp'||r.blendMode!=='normal'||!(r.accumulation==='directOver'||secondary&&r.accumulation==='alphaDarken')||(r.wetEdges??0)!==0||(r.burntEdges??0)!==0||r.gammaCorrect||r.luminance)return false
  for(const[k,controls]of Object.entries(obj(b.modulations)?b.modulations:{}))if(!['size','opacity','flow','roundness'].includes(k)||!Array.isArray(controls)||!controls.every(leaf))return false
  for(const[k,c]of Object.entries(obj(b.dynamics)?b.dynamics:{}))if(!['size','opacity','flow','roundness'].includes(k)||!leaf(c))return false
  const keys=['kind','mask','maskBounds','hardness','aspect','rotation','angle','imageSampling','profile']
  if(Object.keys(t).some(k=>!keys.includes(k)))return false
  if(t.kind==='bitmap')return typeof t.mask==='string'&&/^asset:[a-f0-9]{64}$/.test(t.mask)&&t.profile===undefined
  if(t.kind==='round')return t.profile===undefined&&t.mask===undefined
  return t.kind==='procedural'&&obj(t.profile)&&t.profile.kind==='standard'&&t.profile.shape==='ellipse'&&t.mask===undefined
 }
 return ordinary(v)&&ordinary(child,true)
}
/** Scope check before resource ownership, not a shader selector fallback. */
export function assertPixelAlphaDual168Scope(v:unknown):boolean{const dual=(v as {behavior?:{dual?:{blendMode?:unknown}}}|null)?.behavior?.dual;if(dual?.blendMode!=='hardMixSofterPhotoshop')return false;if(!hasPixelAlphaDual168Scope(v))throw Error('Invalid Pixel ALPHAMASK dual168 scope');return true}

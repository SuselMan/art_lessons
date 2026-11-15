import {isBrushBehavior,type BrushBlendMode} from './brushBehavior.js'
import {isBrushSketch} from './brushSketch.js'
import {isBrushSpray} from './brushSpray.js'

const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:Record<string,unknown>,allowed:readonly string[])=>Object.keys(v).every(k=>allowed.includes(k))
const flat=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
export type SketchSprayComposite194=BrushBlendMode|'copy'|'grainMerge'|'grainExtract'|'negation'
/** Native Sketch/Spray share recorded input and resource primitives, not Pixel
 * paint semantics. Library validation still checks every asset and geometry.
 * Stationary input belongs to the separate timer contract. */
function common(v:unknown):v is Record<string,unknown>{
 if(!obj(v)||v.version!==194||v.model!=='stamp'||v.paperInteraction!==0||!obj(v.tip)||!obj(v.behavior)||!isBrushBehavior(v.behavior))return false
 if(['mixer','wet','texture','scatter','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>v[k]!==undefined))return false
 const b=v.behavior,r=b.rendering,t=v.tip
 if(!keys(b,['version','rendering','spacing','rotation','strokeInput','speedInput','sequentialRandom','clockRead','dynamics','modulations','erase','falloff','colorAdjustment'])||!obj(r)||r.mode!=='buildUp'||r.blendMode!=='normal'||!['directOver','alphaDarken'].includes(String(r.accumulation))||r.gammaCorrect===true||r.luminance===true||(r.wetEdges??0)!==0||(r.burntEdges??0)!==0)return false
 if(v.flow!==1||v.flowPer!=='stamp'||!flat(v.flowByPressure)||!['round','procedural','bitmap'].includes(String(t.kind))||t.alphaThreshold!==undefined)return false
 for(const key of ['dynamics','modulations']){const controls=b[key];if(obj(controls)&&!keys(controls,['size','angle','opacity']))return false}
 if(t.sourceGeometry!==undefined){const g=t.sourceGeometry;if(t.kind!=='bitmap'||t.animation!==undefined||t.imageSampling!==undefined||!obj(g)||!keys(g,['version','width','height'])||g.version!==1||!['width','height'].every(k=>typeof g[k]==='number'&&Number.isInteger(g[k])&&Number(g[k])>=1&&Number(g[k])<=2048))return false}
 return true
}
export function hasSketch194Scope(v:unknown):boolean{
 if(!common(v)||!isBrushSketch(v.sketch)||v.spray!==undefined)return false
 const s=v.sketch,t=v.tip as Record<string,unknown>,b=v.behavior as Record<string,unknown>
 if(s.composite===undefined||b.erase===true&&s.composite!=='normal')return false
 if(s.mode==='simple')return s.maskSignal===undefined&&s.maskSize===undefined&&t.kind==='round'&&t.hardness===1&&t.aspect===1&&t.angle===0&&t.rotation==='fixed'&&keys(t,['kind','hardness','aspect','angle','rotation'])
 if(s.maskSignal!=='native-dab-v1')return false
 if(t.kind==='bitmap')return t.animation!==undefined?obj(t.animation)&&obj(t.animation.geometry)||s.maskSize!==undefined:s.maskSize!==undefined||t.sourceGeometry!==undefined
 return s.maskSize===undefined&&t.color===undefined&&t.material===undefined&&t.animation===undefined
}
export function hasSpray194Scope(v:unknown):boolean{
 if(!common(v)||!isBrushSpray(v.spray)||v.sketch!==undefined)return false
 const s=v.spray,c=s.color,b=v.behavior as Record<string,unknown>
 if(s.composite===undefined||b.erase===true&&s.composite!=='normal')return false
 return c.sourcePolicy===undefined||c.sourcePolicy==='canonical-begin-v1'&&c.sampleInput===true
}
export function hasSketchSpray194Scope(v:unknown):boolean{return hasSketch194Scope(v)||hasSpray194Scope(v)}

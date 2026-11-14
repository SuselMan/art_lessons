import {BRUSH_BLEND_MODES,isBrushBehavior,type BrushBlendMode} from './brushBehavior.js'
export type ColorSmudgeComposite193 = BrushBlendMode | 'dodge' | 'burn' | 'grainMerge' | 'grainExtract' | 'negation' | 'erase'
export const COLOR_SMUDGE193_COMPOSITES:readonly ColorSmudgeComposite193[]=[...BRUSH_BLEND_MODES,'dodge','burn','grainMerge','grainExtract','negation','erase']
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:Record<string,unknown>,allowed:readonly string[])=>Object.keys(v).every(k=>allowed.includes(k))
const unit=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1
/** Whole native Smudge role. Numeric/resource primitives remain validated by
 * isBrushLibrary. No foreign engine, independent mask or carried reservoir can
 * acquire this capability merely by choosing a version or composite alias. */
export function hasColorSmudge193Scope(v:unknown):boolean {
 if(!obj(v)||v.version!==193||v.model!=='mixer'||v.paperInteraction!==0||!obj(v.mixer)||!obj(v.tip)||!obj(v.behavior)||!isBrushBehavior(v.behavior))return false
 if(['wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>v[k]!==undefined))return false
 const m=v.mixer,t=v.tip,b=v.behavior,r=b.rendering
 if(!keys(m,['load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite','algorithm','paintThickness'])||m.load!==0||m.initialLoad!==0||m.strength!==1||!unit(m.pickup)||typeof m.smearAlpha!=='boolean'||!['previousCanvas','projectionCanvas'].includes(String(m.source)))return false
 if(typeof m.colorRateComposite!=='string'||!(COLOR_SMUDGE193_COMPOSITES as readonly string[]).includes(m.colorRateComposite))return false
 if(!keys(b,['version','rendering','colorAdjustment','spacing','rotation','strokeInput','speedInput','sequentialRandom','clockRead','dynamics','modulations','mirror','scatter','erase','falloff'])||!obj(r)||r.mode!=='buildUp'||r.accumulation!=='directOver'||r.blendMode!=='normal'||r.wetEdges!==0||r.burntEdges!==0||r.gammaCorrect===true||r.luminance===true)return false
 if(v.flow!==1||!Array.isArray(v.flowByPressure)||!v.flowByPressure.every(p=>Array.isArray(p)&&p.length===2&&unit(p[0])&&p[1]===1))return false
 if(!['round','procedural','bitmap'].includes(String(t.kind)))return false
 if((m.colorRateComposite==='erase')!==(b.erase===true))return false
 const modern=m.algorithm!==undefined
 if(modern&&!['krita-mask','krita-stamp'].includes(String(m.algorithm)))return false
 if(!modern&&(t.color!==undefined||t.material!==undefined||m.paintThickness!==undefined))return false
 if(modern&&(m.algorithm==='krita-stamp')!==(t.color!==undefined))return false
 if(t.material!==undefined&&(m.algorithm!=='krita-mask'||m.source!=='previousCanvas'||!obj(m.paintThickness)))return false
 if(m.paintThickness!==undefined&&t.material===undefined)return false
 if(m.sampling!==undefined&&(!obj(m.sampling)||m.sampling.mode!==(modern?'maskMean':'adaptiveMean')||typeof m.sampling.radius!=='number'||!Number.isFinite(m.sampling.radius)||m.sampling.radius<0||m.sampling.radius>(modern?1:3)))return false
 if(v.texture!==undefined&&(!obj(v.texture)||v.texture.material!==undefined||!obj(v.texture.application)))return false
 return true
}

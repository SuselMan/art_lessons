/** Clone reads the frozen pre-stroke layer. External source coordinates live
 * in the immutable gesture context, never in the reusable preset. */
export interface BrushClone {version:1;moveSourcePoint:boolean}
export function isCloneDescriptor(d:Record<string,unknown>):boolean{
 if(d.clone===undefined)return true
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),c=d.clone,b=d.behavior
 return record(c)&&Object.keys(c).length===2&&c.version===1&&typeof c.moveSourcePoint==='boolean'
  &&d.model==='stamp'&&d.paperInteraction===0&&d.mixer===undefined
  &&['filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)
  &&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&b.taper===undefined
  &&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'&&b.rendering.wetEdges===0&&b.rendering.burntEdges===0
}

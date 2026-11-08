import type{BrushDescriptor}from'@grafetto/shared'
/** Capability only; the alpha graph itself has one Pixel75 canonical owner. */
export function usesColorSmudgeTexture(brush:BrushDescriptor):boolean{
 if(brush.model!=='mixer'||!brush.texture?.application||!['darken','overlay','linearDodge','linearBurn'].includes(brush.texture.application.mode))return false
 const m=brush.mixer,t=brush.tip,b=brush.behavior
 if(brush.version<103||m?.algorithm!=='krita-mask'||m.source!=='previousCanvas'||m.colorRateComposite!==undefined||m.paintThickness!==undefined||t.kind!=='bitmap'||t.animation||t.color||t.material||b?.dual||b?.erase||b?.rendering?.blendMode!=='normal'||brush.texture.eraseId)throw Error('Modern texture103 requires root static MASK previousCanvas normal Color Smudge')
 return true
}

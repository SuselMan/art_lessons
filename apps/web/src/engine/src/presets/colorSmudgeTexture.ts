import{isTextureCombinations191Scope,type BrushDescriptor}from'@grafetto/shared'
/** Capability only; the alpha graph itself has one Pixel75 canonical owner. */
export function usesColorSmudgeTexture(brush:BrushDescriptor,validated191=false):boolean{
 if(brush.version===191&&brush.model==='mixer'&&brush.texture?.application){if(!validated191&&!isTextureCombinations191Scope(brush))throw Error('Invalid Texture191 Color Smudge scope');return true}
 if(brush.model!=='mixer'||!brush.texture?.application||!['darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'].includes(brush.texture.application.mode))return false
 const m=brush.mixer,t=brush.tip,b=brush.behavior
 if(brush.version<(['colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'].includes(brush.texture.application.mode)?105:103)||m?.algorithm!=='krita-mask'||m.source!=='previousCanvas'||m.colorRateComposite!==undefined||m.paintThickness!==undefined||t.kind!=='bitmap'||t.animation||t.color||t.material||b?.dual||b?.erase||b?.rendering?.blendMode!=='normal'||brush.texture.eraseId)throw Error('Modern texture103 requires root static MASK previousCanvas normal Color Smudge')
 return true
}

import type{BrushDescriptor}from'@grafetto/shared'
/** Feature dispatch after whole-root admission. These constant-time predicates
 * select the existing renderer; they do not validate or promote descriptors. */
export function usesNativeSmudgeFeatures(b:BrushDescriptor|undefined|null):boolean{return !!b&&(b.version===193||b.version===195&&!!b.mixer&&!b.filter&&!b.deform&&!b.grid&&!b.mypaint&&b.behavior?.rendering?.accumulation==='directOver'&&b.mixer.sampling?.mode!=='uniformMean'&&b.mixer.colorRateComposite!==undefined&&b.mixer.load===0&&b.mixer.initialLoad===0&&b.mixer.strength===1&&!b.behavior.dual)}
export function usesNativeFilterMask(b:BrushDescriptor|undefined|null):boolean{return !!b&&(b.version===192||b.version===195&&!!b.filter&&'maskPolicy'in b.filter&&b.filter.maskPolicy==='native-dab-v1')}
export function usesNativeSketchSpray(b:BrushDescriptor|undefined|null):boolean{return !!b&&(b.version===194||b.version===195&&(b.sketch?.composite!==undefined||b.spray?.composite!==undefined))}
export function usesNativePixelMaterials(b:BrushDescriptor|undefined|null):boolean{return !!b&&(b.version===191||b.version===195&&b.model==='stamp'&&!['spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>b[k as keyof BrushDescriptor]!==undefined))}

export function usesNativeSmudgeTexture(b:BrushDescriptor|undefined|null):boolean{return !!b&&(b.version===191||b.version===195&&b.model==='mixer'&&!!b.texture?.application)}

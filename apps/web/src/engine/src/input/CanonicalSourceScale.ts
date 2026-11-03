/** Storage/planning DATA only: callers still bind original source identity and
 * negotiate/persist the absolute scale before any author or replay admission. */
export interface CanonicalSourceScale {
 readonly selectedSizePx:number
 readonly nativeSizePx:number
 readonly effectiveBrushScale:number
}
export function canonicalSourceScale(selectedSizePx:number,nativeDiameterPx:number,originalBrushScale:number):Readonly<CanonicalSourceScale>{
 if(!Number.isFinite(selectedSizePx)||selectedSizePx<=0||!Number.isFinite(nativeDiameterPx)||nativeDiameterPx<=0||!Number.isFinite(originalBrushScale)||originalBrushScale<=0)throw new RangeError('Invalid canonical source size')
 const nativeSizePx=nativeDiameterPx*originalBrushScale,effectiveBrushScale=selectedSizePx/nativeDiameterPx
 if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0||!Number.isFinite(effectiveBrushScale)||effectiveBrushScale<=0||effectiveBrushScale>1e6)throw new RangeError('Canonical source scale overflow')
 return Object.freeze({selectedSizePx,nativeSizePx,effectiveBrushScale})
}

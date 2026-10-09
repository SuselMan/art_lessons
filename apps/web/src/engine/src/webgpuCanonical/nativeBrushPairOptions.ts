/** Separate DEV native arm; used before any engine GPU initialization. */
export function assertNativeBrushPairOptions(enabled:boolean,native:boolean,options:{diagnosticWebgl2?:boolean;diagnosticBrushMrt?:boolean;diagnosticFrontBatch?:boolean;diagnosticMomentTransport?:boolean;diagnosticMomentGpuAudit?:boolean;diagnosticMomentVector?:boolean;joinedFinishDeferred?:boolean;joinedTouchMixed?:boolean}){
 if(enabled&&(!native||options.diagnosticWebgl2||options.diagnosticBrushMrt||options.diagnosticFrontBatch||options.diagnosticMomentTransport||options.diagnosticMomentGpuAudit||options.diagnosticMomentVector||options.joinedFinishDeferred||options.joinedTouchMixed))throw Error('Native paired brush requires separate original native runtime')
}

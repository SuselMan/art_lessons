interface DiagnosticOptions {diagnosticWebgl2?:boolean;diagnosticBrushMrt?:boolean;diagnosticFrontBatch?:boolean}
export function validateWatercolorDiagnosticBackend(options:DiagnosticOptions){
 if(options.diagnosticBrushMrt&&!options.diagnosticWebgl2)throw new Error('Diagnostic brush MRT requires WebGL2')
}
/** Apply only explicit opt-ins; capability failure must not silently benchmark GL1. */
export function configureWatercolorDiagnosticOwners(options:DiagnosticOptions,passes:{warmBrushMrt():boolean;diagnosticBrushMrt:boolean},queue:{frontBatchEnabled:boolean}){
 validateWatercolorDiagnosticBackend(options)
 if(options.diagnosticBrushMrt){
  if(!passes.warmBrushMrt())throw new Error('Diagnostic brush MRT unavailable')
  passes.diagnosticBrushMrt=true
 }
 if(options.diagnosticFrontBatch)queue.frontBatchEnabled=true
}

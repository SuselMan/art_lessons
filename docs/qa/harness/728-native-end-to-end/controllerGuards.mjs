export function validateSourceProvenance(expected,provenance){
 if(expected!==provenance?.code)throw Error('Expected source passport differs before device launch')
}
export function retainGateResult(report,row,save,api){
 report.rows.push(row);save()
 if((api==='source'||api==='contribution'||api==='pressure'||api==='preBrush'||api==='brushNative'||api==='brushFlow'||api==='brushChain')&&row.report.code!==report.code)throw Error('Source code passport differs')
}
/** This function is serialized into a page: no controller-scope references. */
export async function invokeGate(input){
 const name=input.api==='source'?'runSourceCoverage':input.api==='contribution'?'runSourceContribution':input.api==='brushChain'?'runBrush14Chain':input.api==='brushFlow'?'runPreBrush68FlowControl':input.api==='brushNative'?'runPreBrush68NativeGate':input.api==='preBrush'?'runPreBrush68Gate':input.api==='pressure'?'runPressureSeedOracle':'runEndToEnd'
 return window[name](input.options??{size:100,timeoutMs:180000,coverageSequence:true,coverageSameInputIndices:[9],coverageBlankSelected:true,diagnosticHardwareLinearInputs:true,diagnosticLiteralStampVertex:input.enabled})
}

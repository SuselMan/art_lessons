export function validateSourceProvenance(expected,provenance){
 if(expected!==provenance?.code)throw Error('Expected source passport differs before device launch')
}
export function retainGateResult(report,row,save,api){
 report.rows.push(row);save()
 if((api==='source'||api==='contribution')&&row.report.code!==report.code)throw Error('Source code passport differs')
}

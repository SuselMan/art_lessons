/** No GPU allocation may precede these diagnostic admission checks. */
export function validateCoverageSubstitutions(indices:readonly number[]|undefined,count:number,otherDiagnostic:boolean){
 if(!indices)return
 if(otherDiagnostic)throw Error('GL coverage substitution requires unchanged independent source accumulation')
 if(new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=count))throw Error('Substitution indices must identify distinct actual commands')
}

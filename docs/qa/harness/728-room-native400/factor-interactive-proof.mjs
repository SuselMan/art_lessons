import {assertCombinedInteractiveConsumption} from './combined-consumption-proof.mjs'
export function assertFactorInteractiveConsumption(row,expected){
 assertCombinedInteractiveConsumption(row,true)
 const variants=row.factorVariants
 if(row.factor!==true||row.cache.prep!==2||row.cache.hits!==478||row.cache.fallbacks!==0||row.pairedCalls!==210||variants?.length!==1||variants[0].staticCache!==true||variants[0].encoded!==480||variants[0].shaderSHA!==expected||!/^[a-f0-9]{64}$/.test(expected??'')||!(variants[0].shaderBytes>0))throw Error('Actual factor interactive compiled SHA/480 dispatch/cache consumption required')
 return row
}
export function assertFactorInteractiveObserved(census,row,expected){
 assertFactorInteractiveConsumption(row,expected)
 const rows=census.observedFields
 if(!census.actualObservedEnabled||rows?.length!==2||rows.some(r=>!r.completed)||rows.find(r=>r.kind==='waterFront')?.hits!==0||rows.find(r=>r.kind==='diffuse')?.hits!==1)throw Error('Actual factor bypasses original front but consumes diffuse')
 return{shaderSHA:expected,encoded:480,observed:rows}
}

export function assertCombinedInteractiveConsumption(row,allowFactor=false){
 if(!allowFactor&&(row?.factor===true||row?.factorVariants?.length))throw Error('Baseline combined requires factor OFF')
 if(!row||row.paired!==true||!Number.isInteger(row.pairedCalls)||row.pairedCalls<=0||row.film!==false||row.filmVariants?.length!==0||!Number.isInteger(row.cache?.prep)||row.cache.prep<=0||!Number.isInteger(row.cache.hits)||row.cache.hits<=0||row.cache.retainedBytes!==0||row.cache.cleanupFailures!==0)throw Error('Exact paired/cache consumed, film OFF and healthy retirement required')
 return row
}

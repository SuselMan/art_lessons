export const PRESSURE_SHADER_SHA='664ac12d3a663e6463bc6e9dc9a198b2c43ea041fde25bcce3cb1192442cafba'
export function assertActualPressureReady(markers,census){
 const completed=markers.filter(m=>m.stage==='pressure-async-compile:completed')
 if(completed.length!==1||!census.actualAsyncPressureEnabled||!census.asyncCarryPressure?.completed)throw Error('Actual async compile not completed before READY')
 const proof=JSON.parse(completed[0].values?.[0]??'null')
 if(proof?.shaderSHA!==PRESSURE_SHADER_SHA||proof.dispatches!==0||proof.fieldBytes!==0||!proof.completed)throw Error('Actual async descriptor proof invalid')
 return proof
}
export function assertActualPressureConsumed(census){
 if(!census.actualAsyncPressureEnabled||!census.asyncCarryPressure?.completed||!(census.asyncCarryPressure.hits>0))throw Error('Actual prepared pressure pipeline never consumed')
 return census.asyncCarryPressure
}

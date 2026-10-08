/** Structural fixture only: original stroke bytes/IDs/settings remain unchanged. */
export function prepareFixedTape(tape){
 if(!Array.isArray(tape)||tape.length!==1||tape[0].type!=='stroke'||tape[0].tool!=='watercolor'||typeof tape[0].dabsPacked!=='string'||!tape[0].layerId)throw Error('Expected one original packed watercolor stroke')
 const stroke=tape[0]
 return {layer:{type:'layer_add',id:'qa-vector-fixture-layer',layerId:stroke.layerId,name:'Original tape fixture',userId:stroke.userId,timestamp:stroke.timestamp-1},tape}
}
/** Server/log sequence is structural fixture bookkeeping, not stroke content. */
export function equalOriginalStrokeParams(expected,actual){
 const normalize=tape=>tape.map(({seq,...stroke})=>stroke)
 return JSON.stringify(normalize(expected))===JSON.stringify(normalize(actual))
}

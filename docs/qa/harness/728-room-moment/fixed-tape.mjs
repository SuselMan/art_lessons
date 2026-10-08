/** Structural fixture only: original stroke bytes/IDs/settings remain unchanged. */
export function prepareFixedTape(tape,expected=1){
 if(!Array.isArray(tape)||tape.length!==expected||![1,3].includes(expected)||tape.some(o=>o.type!=='stroke'||o.tool!=='watercolor'||typeof o.dabsPacked!=='string'||o.layerId!==tape[0].layerId)||!tape[0].layerId)throw Error('Expected one original packed watercolor stroke')
 const stroke=tape[0]
 return {layer:{type:'layer_add',id:'qa-vector-fixture-layer',layerId:stroke.layerId,name:'Original tape fixture',userId:stroke.userId,timestamp:stroke.timestamp-1},tape}
}
/** Server/log sequence is structural fixture bookkeeping, not stroke content. */
export function equalOriginalStrokeParams(expected,actual){
 const normalize=tape=>tape.map(({seq,...stroke})=>stroke)
 return JSON.stringify(normalize(expected))===JSON.stringify(normalize(actual))
}

const phases=new Set(['readPixels','rowFlip','uploadEnqueue','queueAck'])
export function parseSeedCostConsole(event){
 const args=event.params?.args??[]
 if(args[0]?.value!=='[native-room-seed]')return null
 let cost;try{cost=JSON.parse(args[1]?.value)}catch{throw Error('Malformed native seed cost JSON')}
 if(!phases.has(cost.phase)||!Number.isFinite(cost.wallMs)||cost.wallMs<0||typeof cost.ok!=='boolean'||!Number.isInteger(cost.bytes)||cost.bytes<0||!Number.isInteger(cost.generation)||cost.generation<1||typeof cost.layerId!=='string')throw Error('Invalid native seed cost scalar record')
 return cost
}

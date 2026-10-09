/** Explicit DEV control; never selected by device, timing or previous results. */
export function parseMaterialQuantumCap(raw,interactive){
 if(raw!==undefined&&!['8','16','32'].includes(raw))throw Error('Explicit material quantum cap8/16/32 required')
 const cap=raw===undefined?8:Number(raw)
 if(cap!==8&&!interactive)throw Error('Material quantum cap optin requires interactive native A mode')
 return cap
}

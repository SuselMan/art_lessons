import crypto from 'node:crypto'
export function decodeSettleMaterial(packet,variant){
 if(packet.errors?.length||packet.variant!==variant)throw Error('Settle packet invalid')
 if(variant==='A'&&!packet.patches?.length)throw Error('A source specialization not exercised')
 const g=packet.material
 if(g?.width!==1024||g.height!==1024||g.byteLength!==4194304||g.base64?.length!==5592408||g.nonzeroAlpha<1)throw Error('Full material budget/nonempty mismatch')
 const bytes=Buffer.from(g.base64,'base64')
 if(bytes.length!==g.byteLength||crypto.createHash('sha256').update(bytes).digest('hex')!==g.sha256)throw Error('Settle material SHA mismatch')
 return bytes
}
export function assertPairedSettleInputs(arms){
 if(arms.length!==2||arms[0].variant!=='literal'||arms[1].variant!=='A'||arms[0].tapeSha256!==arms[1].tapeSha256||JSON.stringify(arms[0].paper)!==JSON.stringify(arms[1].paper))throw Error('Paired tape/paper/arm identity mismatch')
}

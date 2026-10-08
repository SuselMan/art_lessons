import crypto from 'node:crypto'
export function decodeFactorPacket(packet) {
  if(packet?.errors?.length)throw Error('GPU factor diagnostic errors')
  if(JSON.stringify(packet?.roi)!==JSON.stringify({x:384,yTop:352,w:96,h:96}))throw Error('Unexpected factor ROI')
  const expected=['amount','contact','modulation','no-tip-counterfactual']
  if(packet.groups?.length!==4)throw Error('Expected exactly four factor groups')
  let total=0
  return packet.groups.map((g,i)=>{
    if(g.group!==expected[i]||g.byteLength!==36864||typeof g.base64!=='string'||g.base64.length!==49152)throw Error('Factor packet budget/group mismatch')
    const bytes=Buffer.from(g.base64,'base64');total+=bytes.length
    if(bytes.length!==g.byteLength||total>147456||crypto.createHash('sha256').update(bytes).digest('hex')!==g.sha256)throw Error('Factor payload SHA/budget mismatch')
    return{group:g.group,channels:g.channels,sha256:g.sha256,bytes}
  })
}

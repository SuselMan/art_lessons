import crypto from 'node:crypto'
export function decodeVariantPacket(packet){
 if(packet?.errors?.length)throw Error('GPU variant errors')
 if(packet.arms?.length!==12)throw Error('Expected12 pressure/variant arms')
 let total=0;const records=[]
 for(let i=0;i<12;i++){
  const a=packet.arms[i],p=[.7,.1,.02,0][Math.floor(i/3)],v=['literal','A','B'][i%3]
  if(a.pressure!==p||a.variant!==v||JSON.stringify(a.roi)!==JSON.stringify({x:384,yTop:352,w:96,h:96})||a.groups?.length!==3)throw Error('Variant/pressure/ROI mismatch')
  for(let j=0;j<3;j++){
   const g=a.groups[j];if(g.group!==['amount','coverage','contact'][j]||g.byteLength!==36864||g.base64?.length!==49152)throw Error('Group/budget mismatch')
   const bytes=Buffer.from(g.base64,'base64');total+=bytes.length
   if(bytes.length!==36864||total>1327104||crypto.createHash('sha256').update(bytes).digest('hex')!==g.sha256)throw Error('Variant payload SHA mismatch')
   records.push({pressure:p,variant:v,roi:a.roi,group:g.group,channels:g.channels,sums:g.sums,max:g.max,sha256:g.sha256,bytes})
  }
 }
 return records
}

import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const input='/home/suselman/projects/pencil-agents/680-device-qa-guards/temp/room-KJc0OoVo/ops.json'
const ops=JSON.parse(readFileSync(input,'utf8'))
export function remapFixture(ops,prefix,userId,now){
 const ids=new Map(ops.map(o=>[o.id,prefix+'-'+o.id])),wash=new Map(),first=Math.min(...ops.map(o=>o.timestamp))
 return ops.map(original=>{
  const o=structuredClone(original);delete o.seq;o.id=ids.get(original.id);o.userId=userId;o.timestamp=now+(original.timestamp-first)
  if(o.targetOpId){if(!ids.has(o.targetOpId))throw Error('Missing history target');o.targetOpId=ids.get(o.targetOpId)}
  if(o.strokeId)o.strokeId=ids.get(o.strokeId)??prefix+'-stroke-'+o.strokeId
  if(o.washId){if(!wash.has(o.washId))wash.set(o.washId,prefix+'-wash-'+o.washId);o.washId=wash.get(o.washId)}
  return o
 })
}
const mapped=remapFixture(ops,'qa-test','qa-author',1700000000000)
if(mapped.length!==47||new Set(mapped.map(o=>o.id)).size!==47)throw Error('Fixture count/identity')
for(let i=0;i<ops.length;i++)for(const k of ['dabs','dabsPacked','_wet','preset','color','layerId','tool'])if(JSON.stringify(mapped[i][k])!==JSON.stringify(ops[i][k]))throw Error('Changed material input '+k)
writeFileSync('temp/load/source-manifest.json',JSON.stringify({count:ops.length,inputSHA:createHash('sha256').update(readFileSync(input)).digest('hex'),remap:'unique operation/stroke/wash IDs, own author, timestamp translation; original dabs/wet/preset/color/layer/tool exact',nativeClaim:false},null,2))
console.log('47 operation remap, material payload identity and target closure PASS')

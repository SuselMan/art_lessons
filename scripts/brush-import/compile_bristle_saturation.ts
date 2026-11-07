import {createHash} from 'node:crypto'
import {bristleSaturationProfileBytes} from '../../packages/shared/src/bristleSaturationProfile.js'
import {createBristleInkProfile} from '../../apps/web/src/engine/src/presets/brushBristleInk'
import {prepareBristleSaturationTable,copyBristleSaturationTable} from '../../apps/web/src/engine/src/presets/brushBristleSaturationTable'
// One request, stdin-only. No caller filename, network, asset reader or cache.
const MAX_INPUT=2*1024*1024
async function main(){
 const chunks:Buffer[]=[];let length=0
 for await(const chunk of process.stdin){length+=chunk.length;if(length>MAX_INPUT)throw Error('Bristle compiler input limit');chunks.push(chunk)}
 const ink=JSON.parse(Buffer.concat(chunks).toString('utf8'))
 const profileBytes=bristleSaturationProfileBytes(ink)
 if(!ink.depletion.every((v:number)=>v===Math.fround(v)))throw Error('Expected canonical F32 curve')
 if(!ink.useSaturation)throw Error('Expected saturation-enabled profile')
 const profile=createBristleInkProfile(ink),result=prepareBristleSaturationTable(profile)
 if(result.kind!=='ready'){
  const quality=result.quality
  const summary=quality?Object.fromEntries(Object.entries({maxAbsoluteError:quality.maxAbsoluteError,limit:quality.limit,witnesses:quality.witnesses,coveredBins:quality.coveredBins,requiredBins:quality.requiredBins}).filter(([,v])=>Number.isFinite(v))):undefined
  process.stderr.write(JSON.stringify({kind:'unsupported',reason:result.reason.slice(0,256),quality:summary})+'\n');process.exitCode=2;return
 }
 const bytes=copyBristleSaturationTable(result.table)
 if(bytes.byteLength<64||bytes.byteLength>524288)throw Error('Bristle compiler output limit')
 // Quality is diagnostic compiler evidence, never runtime authority or portable input.
 process.stdout.write(JSON.stringify({version:1,profileSha256:createHash('sha256').update(profileBytes).digest('hex'),byteLength:bytes.length,bytes:Buffer.from(bytes).toString('base64'),quality:result.table.quality}))
}
main().catch(()=>{process.stderr.write('Bristle saturation compilation rejected\n');process.exitCode=1})

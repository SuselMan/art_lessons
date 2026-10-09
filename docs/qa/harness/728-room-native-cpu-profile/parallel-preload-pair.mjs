import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {assertParallelPreloadPair,assertSourcePrecompilePair} from './parallel-preload-pair-proof.mjs'
const sourceAMode=process.env.QA_PAIR_MODE==='source-A';if(![undefined,'parallel3','source-A'].includes(process.env.QA_PAIR_MODE))throw Error('Explicit pair mode');
const out=process.env.QA_PAIR_OUT
if(process.env.QA_PAIR_ALLOCATION!=='surface'||!out)throw Error('Explicit allocated Surface and registered disposable QA_PAIR_OUT required')
const disposable=path.dirname(path.resolve(out)),markerPath=path.join(disposable,'.codex-qa-disposable.json')
if(!fs.existsSync(markerPath)||fs.lstatSync(markerPath).isSymbolicLink())throw Error('Registered disposable parent marker required')
const marker=JSON.parse(fs.readFileSync(markerPath)),registry=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/codex-qa/resources.json')))
if(marker.path!==disposable||registry[marker.id]?.path!==disposable||registry[marker.id]?.nonce!==marker.nonce||registry[marker.id]?.finished)throw Error('Disposable registry/marker identity invalid')
if(fs.existsSync(path.join(out,'pair-report.json')))throw Error('Refuse duplicate pair evidence')
fs.mkdirSync(out,{recursive:true})
const root=fileURLToPath(new URL('../../../../',import.meta.url)),referenceOut=path.join(out,'reference')
const baseEnv={...process.env,QA_SCENARIO:sourceAMode?'water-pigment400-long':'four400',QA_CAPTURE_FIELDS:'0',QA_CARRY_HARDWARE_PRESSURE:'1',QA_FIRST_LIVE_WARMUP:sourceAMode?'0':'1',QA_RAW_CANVAS_WARMUP:'0',QA_CPU_PROFILE:'0',QA_TIMELINE_TRACE:'0',QA_PLANNER_ATTRIBUTION:'0',QA_SELECTED_FRONT_FENCE:'0',QA_NATIVE_INFLIGHT_LIMIT:'0',QA_ASYNC_PRESSURE_PIPELINE:'0'}
function run(file,env){fs.mkdirSync(env.QA_OUT,{recursive:true});return new Promise((resolve,reject)=>execFile(process.execPath,[file],{cwd:root,env,timeout:150000,maxBuffer:262144},(error,stdout,stderr)=>{fs.writeFileSync(path.join(env.QA_OUT,'controller-output.txt'),stdout+'\n'+stderr);if(error)reject(Error('Owned controller failed: '+file));else resolve()}))}
await run('docs/qa/harness/728-room-native400/controller.mjs',{...baseEnv,QA_OUT:referenceOut,QA_ACTUAL_ASYNC_PRESSURE:'1',QA_ACTUAL_OBSERVED_FIELDS:'1',QA_ENDPOINT_EXPORT:'1',QA_SOURCE_PRECOMPILE:sourceAMode?'1':'0'})
const reference=JSON.parse(fs.readFileSync(path.join(referenceOut,'report.json')))
if(!reference.complete||!reference.ownedContextDisposed||reference.packedTape?.length!==(sourceAMode?2:4)||!reference.export?.alpha)throw Error('Fresh current-source reference incomplete')
const reports=[]
for(const actual of ['0','1']){
 const armOut=path.join(out,actual==='0'?'off':'on')
 await run('docs/qa/harness/728-room-native-cpu-profile/native-replay-controller.mjs',{...baseEnv,QA_OUT:armOut,QA_ACTUAL_PRELOAD:sourceAMode?'1':actual,QA_SOURCE_PRECOMPILE:sourceAMode?actual:'0',QA_REFERENCE_REPORT:path.join(referenceOut,'report.json'),QA_REFERENCE_PNG:path.join(referenceOut,'native-material.png')})
 reports.push(JSON.parse(fs.readFileSync(path.join(armOut,'report.json'))))
}
const result=(sourceAMode?assertSourcePrecompilePair:assertParallelPreloadPair)(reference,...reports)
fs.writeFileSync(path.join(out,'pair-report.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({complete:true,source:result.source,endpointSHA:result.endpoint.sha,scope:result.scope}))

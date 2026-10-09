import {preservePairEvidence,verifyPairEvidence} from './pair-evidence.mjs'
import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {assertParallelPreloadPair,assertSourcePrecompilePair} from './parallel-preload-pair-proof.mjs'
const sourceAMode=process.env.QA_PAIR_MODE==='source-A';if(![undefined,'parallel3','source-A'].includes(process.env.QA_PAIR_MODE))throw Error('Explicit pair mode');
const durableEvidence=process.env.QA_PAIR_EVIDENCE;if(!durableEvidence)throw Error('Explicit durable QA_PAIR_EVIDENCE required before running pair');
const reuseReference=process.env.QA_PAIR_REFERENCE_EVIDENCE;if(reuseReference&&!sourceAMode)throw Error('Durable reuse only source A mode');
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
const progress={complete:false,mode:sourceAMode?'source-A':'parallel3',stage:'reference',source:process.env.QA_SOURCE,completedArms:[]};const saveProgress=()=>fs.writeFileSync(path.join(out,'pair-progress.json'),JSON.stringify(progress,null,2)+'\n');saveProgress();
try{
if(reuseReference){const previous=verifyPairEvidence(reuseReference);if(!previous.referenceReusable||previous.source!==process.env.QA_SOURCE)throw Error('Reusable exact reference source invalid');fs.mkdirSync(referenceOut,{recursive:true});fs.copyFileSync(path.join(reuseReference,'reference-report.json'),path.join(referenceOut,'report.json'),fs.constants.COPYFILE_EXCL);fs.linkSync(path.join(reuseReference,'reference-native-material.png'),path.join(referenceOut,'native-material.png'));progress.reusedReference=true;progress.referencePackedSHA=previous.files.find(f=>f.name==='packed-input.json')?.sha256;saveProgress()}else{
await run('docs/qa/harness/728-room-native400/controller.mjs',{...baseEnv,QA_OUT:referenceOut,QA_ACTUAL_ASYNC_PRESSURE:'1',QA_ACTUAL_OBSERVED_FIELDS:'1',QA_ENDPOINT_EXPORT:'1',QA_SOURCE_PRECOMPILE:sourceAMode?'1':'0'})
}
const reference=JSON.parse(fs.readFileSync(path.join(referenceOut,'report.json')))
if(!reference.complete||!reference.ownedContextDisposed||reference.packedTape?.length!==(sourceAMode?2:4)||!reference.export?.alpha)throw Error('Fresh current-source reference incomplete')
const reports=[]
for(const actual of ['0','1']){
 const arm=actual==='0'?'off':'on';progress.stage=arm;saveProgress();const armOut=path.join(out,arm)
 await run('docs/qa/harness/728-room-native-cpu-profile/native-replay-controller.mjs',{...baseEnv,QA_OUT:armOut,QA_ACTUAL_PRELOAD:sourceAMode?'1':actual,QA_SOURCE_PRECOMPILE:sourceAMode?actual:'0',QA_REFERENCE_REPORT:path.join(referenceOut,'report.json'),QA_REFERENCE_PNG:path.join(referenceOut,'native-material.png')})
 const row=JSON.parse(fs.readFileSync(path.join(armOut,'report.json')));if(!row.complete||row.error||row.errors?.length||row.memoryError||row.memoryGuardFailure||!row.ownedContextDisposed||row.ownedContextDisposeError)throw Error('Stop pair before next arm: incomplete owned '+arm);reports.push(row);progress.completedArms.push(arm);saveProgress()
}
const result=(sourceAMode?assertSourcePrecompilePair:assertParallelPreloadPair)(reference,...reports)
fs.writeFileSync(path.join(out,'pair-report.json'),JSON.stringify(result,null,2)+'\n')
progress.complete=true;progress.stage='complete';saveProgress();
console.log(JSON.stringify({complete:true,source:result.source,endpointSHA:result.endpoint.sha,scope:result.scope}))

}catch(error){progress.error=String(error);progress.complete=false;saveProgress();throw error}
finally{try{progress.durableEvidence=preservePairEvidence(out,durableEvidence,disposable);progress.evidenceExtracted=true;progress.evidencePromoted=true;progress.durableEvidencePath=path.resolve(durableEvidence);saveProgress()}catch(error){progress.evidenceExtracted=false;progress.evidencePromoted=false;progress.evidenceError=String(error);saveProgress();process.exitCode=1;console.error('DO NOT FINISH DISPOSABLE: bounded evidence extraction failed')}}

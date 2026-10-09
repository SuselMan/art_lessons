import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {execFile} from 'node:child_process'
import {awaitPairRam} from '../728-room-native-cpu-profile/pair-ram-admission.mjs'
import {preservePairEvidence} from '../728-room-native-cpu-profile/pair-evidence.mjs'
import {assertFrontCachePair} from './front-cache-pair-proof.mjs'
const mode=process.env.QA_PAIR_KIND??'front-cache';if(!['front-cache','brush-pair'].includes(mode))throw Error('Explicit native pair mode');
const out=process.env.QA_PAIR_OUT,durable=process.env.QA_PAIR_EVIDENCE
if(!out||!durable||process.env.QA_PAIR_ALLOCATION!=='surface')throw Error('Explicit allocated pair output/evidence required')
const root=path.dirname(path.resolve(out)),marker=JSON.parse(fs.readFileSync(path.join(root,'.codex-qa-disposable.json'))),registry=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/codex-qa/resources.json')))
if(marker.path!==root||registry[marker.id]?.path!==root||registry[marker.id]?.nonce!==marker.nonce||registry[marker.id]?.finished)throw Error('Registered current disposable required')
if(fs.existsSync(out))throw Error('Refuse existing pair output');fs.mkdirSync(out,{mode:0o700})
const manifest=JSON.parse(fs.readFileSync(process.env.QA_MANIFEST));if(manifest.head!==process.env.QA_SOURCE)throw Error('Current auto source passport required')
const progress={source:manifest.head,stage:'preflight',completedArms:[],ramAdmissions:[],scope:'Two source-identical native packed arms; historical reference used only as input corpus; no causal speedup claim'}
const save=()=>fs.writeFileSync(path.join(out,'pair-progress.json'),JSON.stringify(progress))
const run=(env)=>new Promise((resolve,reject)=>execFile(process.execPath,['docs/qa/harness/728-room-native-cpu-profile/native-replay-controller.mjs'],{cwd:process.env.QA_RUNTIME,env:{...process.env,...env},timeout:150000,maxBuffer:65536},(error)=>error?reject(error):resolve()))
const reports=[]
try{
 for(const arm of ['off','on']){
  progress.stage=arm+'-admission';save()
  await awaitPairRam(remaining=>new Promise((resolve,reject)=>execFile('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5','surface','powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"'],{timeout:Math.min(5000,remaining),encoding:'utf8'},(error,raw)=>error?reject(error):resolve(Number(raw.trim())/1024))),{record:value=>{progress.ramAdmissions.push({arm,MiB:value});save()}})
  progress.stage=arm;save()
  const armOut=path.join(out,arm)
  await run({QA_OUT:armOut,QA_PAIR_MODE:mode,QA_FRONT_CACHE:mode==='front-cache'&&arm==='on'?'1':'0',QA_NATIVE_BRUSH_PAIR:mode==='brush-pair'&&arm==='on'?'1':'0',QA_ACTUAL_PRELOAD:'1',QA_CARRY_HARDWARE_PRESSURE:'1',QA_SOURCE_PRECOMPILE:'1',QA_FIRST_LIVE_WARMUP:'0',QA_RAW_CANVAS_WARMUP:'0',QA_NATIVE_INFLIGHT_LIMIT:'0',QA_ASYNC_PRESSURE_PIPELINE:'0',QA_SCENARIO:'water-pigment400-long'})
  const row=JSON.parse(fs.readFileSync(path.join(armOut,'report.json')))
  if(!row.complete||!row.ownedContextDisposed||row.error||row.errors?.length||row.memoryError||row.memoryGuardFailure||row.ownedContextDisposeError)throw Error('Stop before next arm: incomplete actual '+arm)
  reports.push(row);progress.completedArms.push(arm);save()
 }
 progress.proof=assertFrontCachePair(reports[0],reports[1],manifest.head,mode);progress.stage='complete';save()
}catch(error){progress.failure=String(error).slice(0,500);save();process.exitCode=1}
finally{
 // Full raw reports stay ephemeral; minification preserves every parsed field.
 for(const arm of ['off','on']){const file=path.join(out,arm,'report.json');if(fs.existsSync(file)){const raw=fs.readFileSync(file),parsed=JSON.parse(raw);const minified=JSON.stringify(parsed);assert.deepEqual(JSON.parse(minified),parsed);(progress.originalReports??={})[arm]={bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')};fs.writeFileSync(file,minified)}}
 const evidence=preservePairEvidence(out,path.resolve(durable),root)
 progress.evidencePromoted=evidence.promoted;progress.evidenceExtracted=true;progress.durableEvidencePath=path.resolve(durable);save()
 console.info(JSON.stringify({stage:progress.stage,completedArms:progress.completedArms,exact:progress.proof?.exact,promoted:progress.evidencePromoted}))
}

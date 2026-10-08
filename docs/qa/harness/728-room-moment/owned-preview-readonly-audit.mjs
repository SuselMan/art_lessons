import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
const worktree=process.env.QA_PREVIEW_WT??'/home/suselman/projects/pencil-agents/728-solvent-init',head='35f93715',prefix='docs/qa/harness/728-gl-queue-batch/'
// Freeze the audited module's exact revision without editing its worktree.
let source=execFileSync('git',['show',head+':'+prefix+'OwnedPreviewRuntime.mjs'],{cwd:worktree,encoding:'utf8'})
source=source.replace(/from '\.\/(.*?)'/g,(_,file)=>"from '"+pathToFileURL(worktree+'/'+prefix+file).href+"'")
const {bindOwnedPreviewRuntime}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
const {PrewarmedPreviewPool}=await import(pathToFileURL(worktree+'/'+prefix+'PrewarmedPreviewPool.mjs')),{PREVIEW_BYTES}=await import(pathToFileURL(worktree+'/'+prefix+'SealedPreviewTransport.mjs'))
let tick;globalThis.requestAnimationFrame=fn=>(tick=fn,1);globalThis.cancelAnimationFrame=()=>{}
const pool=()=>new PrewarmedPreviewPool({create:(width,height)=>({texture:{},width,height}),destroy(){}},{budgetBytes:3*PREVIEW_BYTES})
const fixture=()=>{const p=pool(),reveals=new Map(),fields=Object.fromEntries(['original','coverage','pigmentLoad','pigmentBase','colourLoad','colourBase','solventLoad','solventBase','presentation'].map(k=>[k,{texture:{k},copyTo:out=>{if(!p.owns(out))throw Error('Canonical destination written')}}])),owner={token:{sequence:1},lease:{fields},source:{epoch:1,chunks:[{composite:{profile:{},preset:{},color:[.2,0,.6]}}]}},e={gl:{isContextLost:()=>false,finish(){}},_washReveals:reveals,_ribbonPasses:{drawRibbonCompositeRect(tile){if(!p.owns(tile.buffer))throw Error('Canonical composite destination')}},_scheduleDisplay(){},_strokeId:null},runtime=bindOwnedPreviewRuntime(e,{hold:o=>{const h={};reveals.set(o.lease.fields.presentation,h);return h}},{pool:p,port:{stats:{},initialize(){},step(){}},domain:{disposeAfterFence(){}}});return{p,owner,e,runtime,reveals}}
const result={head,scope:'Read-only frozen CPU lifecycle reproduction; not hardware or final installer verdict'}
const broken=fixture();broken.owner.lease.fields.pigmentLoad=null;try{broken.runtime.seal(broken.owner)}catch(e){result.constructorFailure={error:String(e),activeLeases:broken.p.active.size};try{broken.runtime.disposeAfterFence()}catch(e){result.constructorFailure.disposeError=String(e)}}
const stale=fixture();stale.runtime.seal(stale.owner);stale.owner.source.epoch++;tick();result.staleEpoch={pendingStillAttached:!!stale.reveals.get(stale.owner.lease.fields.presentation).pending,activeLeases:stale.p.active.size};stale.runtime.disposeAfterFence()
const lost=fixture();lost.runtime.seal(lost.owner);lost.e.gl.isContextLost=()=>true;tick();result.contextLoss={pendingStillAttached:!!lost.reveals.get(lost.owner.lease.fields.presentation).pending,activeLeases:lost.p.active.size};lost.runtime.disposeAfterFence()
if(process.env.QA_AUDIT_OUT)fs.writeFileSync(process.env.QA_AUDIT_OUT,JSON.stringify(result,null,2));console.log(JSON.stringify(result))

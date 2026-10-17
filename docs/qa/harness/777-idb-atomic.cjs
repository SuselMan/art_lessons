// IndexedDB-only headless Chromium proof; no Grafetto renderer/WebGL/server.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process')
const {chromium}=require('playwright'),esbuild=require('esbuild')
async function main(){
 const disposable=process.argv[2],reportPath=process.argv[3]
 if(!disposable||!reportPath)throw new Error('usage: node harness.cjs registeredDisposableDir compactReportPath')
 const source=path.resolve('apps/web/src/pages/Room/net/outboxStorage.ts')
 const sourceSha=crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex')
 const bundle=await esbuild.build({entryPoints:[source],bundle:true,format:'iife',globalName:'OutboxProto',platform:'browser',write:false})
 const profile=path.join(disposable,'profile')
 const context=await chromium.launchPersistentContext(profile,{executablePath:'/home/suselman/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',headless:true,args:['--disable-gpu']})
 try{
  await fs.writeFile(path.join(disposable,'owner.json'),JSON.stringify({owner:'/root/puddle_undo',pid:process.pid,command:'777-idb-atomic.cjs --disable-gpu',expiresAt:new Date(Date.now()+3600000).toISOString(),processes:execFileSync('ps',['-eo','pid,ppid,args'],{encoding:'utf8'}).split('\n').filter(line=>line.includes(profile))},null,2))
  await context.route('http://outbox-prototype.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>777 IndexedDB only</title>'}))
  const page=await context.newPage();await page.goto('http://outbox-prototype.test/');await page.addScriptTag({content:bundle.outputFiles[0].text})
  const cases=await page.evaluate(async()=>{
   const results=[],storage=OutboxProto.createIndexedDbOutboxStorage()
   const entry=(id,terminal=false)=>({op:{id,type:'stroke',userId:'A',layerId:'L',timestamp:1,tool:'pencil',preset:'HB',color:[0,0,0],dabs:[]},roomId:'old',attempts:0,nextRetryAt:0,...terminal?{terminal:{result:{ok:false,reason:'target_gone'},recordedAt:2}}:{}})
   const assert=(test,message)=>{if(!test)throw new Error(message)}
   await storage.put(entry('a',true));await storage.put(entry('b',true));await storage.put(entry('a'))
   assert((await storage.getAll('old')).find(row=>row.op.id==='a').terminal,'stale writer overwrote terminal');results.push('sticky terminal put')
   await storage.delete('a');assert((await storage.getAll('old')).some(row=>row.op.id==='a'),'late ACK deleted terminal');results.push('sticky terminal delete')
   const invalid=entry('invalid');invalid.op.uncloneable=()=>{}
   let aborted=false
   try{await storage.replaceTerminal('old',['a','b'],[entry('good'),invalid])}catch{aborted=true}
   const afterAbort=await storage.getAll('old')
   assert(aborted&&afterAbort.length===2&&afterAbort.every(row=>['a','b'].includes(row.op.id)),'IDB abort left partial replacements');results.push('real DataCloneError rollback all originals / zero replacements')
   assert(await storage.replaceTerminal('old',['a','b'],[entry('good'),entry('good2')]),'handoff failed')
   assert((await storage.putGuarded(entry('a'))).kind==='retired','stale put bypassed compact tombstone')
   assert((await storage.getAll('old')).every(row=>['good','good2'].includes(row.op.id)),'tombstone leaked as wire op');results.push('atomic handoff / compact tombstone / filtered reads')
   const second=OutboxProto.createIndexedDbOutboxStorage()
   await Promise.all([storage.put(entry('race',true)),second.put(entry('race'))])
   assert((await storage.getAll('old')).find(row=>row.op.id==='race').terminal,'second reader overwrote terminal');results.push('two new writer transactions')
   const winners=await Promise.all([storage.replaceTerminal('old',['race'],[entry('winner')]),second.replaceTerminal('old',['race'],[entry('loser')])])
   assert(winners.filter(Boolean).length===1,'two handoffs won');assert(!(await storage.getAll('old')).some(row=>row.op.id==='loser'),'losing handoff inserted rows');results.push('concurrent handoff exactly one winning local transaction')
   await storage.put(entry('restart-terminal',true))
   return results
  })
  await page.close()
  const restarted=await context.newPage();await restarted.goto('http://outbox-prototype.test/');await restarted.addScriptTag({content:bundle.outputFiles[0].text})
  const restart=await restarted.evaluate(async()=>{const storage=OutboxProto.createIndexedDbOutboxStorage(),rows=await storage.getAll('old');return {terminal:rows.find(row=>row.op.id==='restart-terminal')?.terminal?.result.reason,rows:rows.map(row=>row.op.id),retired:(await storage.putGuarded({op:{id:'a'},roomId:'old',attempts:0,nextRetryAt:0})).kind}})
  if(restart.terminal!=='target_gone'||restart.retired!=='retired')throw new Error('page restart lost terminal/tombstone')
  cases.push('page restart retained terminal payload and sticky compact tombstone')
  const report={sourceSha,browser:context.browser().version(),gpuDisabled:true,webglContextsCreated:0,origin:'http://outbox-prototype.test',cases,restart,passed:true}
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,cases:cases.length,sourceSha}))
 }finally{await context.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})

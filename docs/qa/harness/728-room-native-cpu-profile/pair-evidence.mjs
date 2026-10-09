import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const reportKeys=['source','scenario','complete','ownedContextDisposed','browserPaper','browserSource','browserFactorySource','export','packedTape','carryPressureControl','actualObserved','actualAsyncPressure','sourcePreparation','sourcePipelinePassport','sourceRequiredKeys','seedBridgeCosts','publicationCosts','publicationCostOverflow','ramStart','ram','readyAt','firstDownAt','scheduler','startup','replayWallMs','endpointExact','readbackOutsideReplayTiming','actualPreparation','replay','stage','interactiveMarkers','interactivePhases','interactiveScope','primaryRaf','strokeObservations','materialQuantumCap','materialScopeCap','timestampCapture','timestampBrowserSource','schedulingSnapshot','schedulingInput','schedulingProof','schedulingSourcePassport','schedulingRestore','beforeSecond','declaredInputGapMs','nativeBrushPairArm','frontCacheArm','inputReference','frontCacheBrowserSource','frontMaterialRoles']
/** No env, source text, auth, failure body, URL census or arbitrary raw report keys. */
function compactReport(r){const c={};for(const key of reportKeys)if(r[key]!==undefined)c[key]=r[key];c.failed=!!r.error||!!r.errors?.length||!!r.memoryError||!!r.memoryGuardFailure;c.cleanupFailed=!!r.ownedContextDisposeError;if(r.final)c.final={gl:r.final.gl,lost:r.final.lost,error:r.final.error?'Reported native error':null,native:r.final.native,ready:r.final.ready};if(r.errors)c.errors=r.errors.length?['Reported console error']:[];return c}
export function verifyPairEvidence(target,io=fs){
 const manifest=JSON.parse(io.readFileSync(path.join(target,'evidence.json'),'utf8'))
 if(manifest.promoted!==true||!Array.isArray(manifest.files)||new Set(manifest.files.map(x=>x.name)).size!==manifest.files.length)throw Error('Evidence not promoted')
 for(const e of manifest.files){if(!/^(reference|off|on)-report\.json$|^packed-input\.json$|^reference-native-material\.png$/.test(e.name)||!Number.isInteger(e.bytes)||e.bytes<0||e.bytes>4194304)throw Error('Evidence manifest file invalid');const bytes=io.readFileSync(path.join(target,e.name));if(bytes.length!==e.bytes||sha(bytes)!==e.sha256)throw Error('Evidence SHA/size differs')}
 return manifest
}
/** Atomic bounded promotion; any failure leaves original disposable untouched. */
export function preservePairEvidence(disposableOut,durableOut,disposableRoot=disposableOut,io=fs){
 const source=path.resolve(disposableOut),target=path.resolve(durableOut),root=path.resolve(disposableRoot)
 if(source!==root&&!source.startsWith(root+path.sep))throw Error('Pair source outside registered disposable')
 if(target===root||target.startsWith(root+path.sep))throw Error('Durable pair evidence must be outside disposable')
 if(io.existsSync(target))throw Error('Refuse duplicate durable pair evidence')
 const stage=target+'.pending-'+crypto.randomUUID();io.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});io.mkdirSync(stage,{mode:0o700})
 const summary={promoted:true,files:[],referenceReusable:false};let renamed=false
 try{
  const write=(name,bytes,original)=>{if(bytes.length>4194304)throw Error('Evidence exceeds bounded cap');if(original){io.linkSync(original,path.join(stage,name));io.chmodSync(path.join(stage,name),0o400)}else io.writeFileSync(path.join(stage,name),bytes,{mode:0o600,flag:'wx'});const actual=io.readFileSync(path.join(stage,name));if(actual.length!==bytes.length||sha(actual)!==sha(bytes))throw Error('Written evidence differs');summary.files.push({name,bytes:bytes.length,sha256:sha(bytes)})}
  for(const arm of ['reference','off','on']){
   const report=path.join(source,arm,'report.json');if(!io.existsSync(report))continue
   const size=io.statSync(report).size;if(size>4194304)throw Error('Pair report exceeds bounded evidence cap')
   const parsed=JSON.parse(io.readFileSync(report));if(!/^[a-f0-9]{40}$/.test(parsed.source??''))throw Error('Exact report HEAD required');if(summary.source&&summary.source!==parsed.source)throw Error('Evidence source differs across arms');summary.source=parsed.source;write(arm+'-report.json',Buffer.from(JSON.stringify(compactReport(parsed))))
   if(arm==='reference'&&parsed.complete&&Array.isArray(parsed.packedTape)){
    if(!parsed.ownedContextDisposed||parsed.error||parsed.errors?.length||parsed.final?.gl!==0||parsed.final?.lost!==false||parsed.final?.error||!(parsed.export?.alpha>0))throw Error('Completed reference is not clean/disposed/nonempty')
    if(!/^[a-f0-9]{40}$/.test(parsed.source??''))throw Error('Exact reference HEAD required')
    write('packed-input.json',Buffer.from(JSON.stringify(parsed.packedTape)))
    const png=path.join(source,arm,'native-material.png');if(!io.existsSync(png))throw Error('Completed reference export missing')
    if(io.statSync(png).size>2097152)throw Error('Pair PNG exceeds bounded evidence cap')
    const bytes=io.readFileSync(png);if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==parsed.export?.width||bytes.readUInt32BE(20)!==parsed.export?.height)throw Error('Reference PNG dimensions differ')
    if(!/^[a-f0-9]{64}$/.test(parsed.export?.pngSha256??'')||sha(bytes)!==parsed.export.pngSha256)throw Error('Reference PNG checksum differs actual export passport')
    write('reference-native-material.png',bytes,png);summary.referenceReusable=true;summary.source=parsed.source
   }
  }
  if(!summary.files.length)throw Error('No reviewable evidence available; retain disposable')
  io.writeFileSync(path.join(stage,'evidence.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600,flag:'wx'})
  verifyPairEvidence(stage,io);io.renameSync(stage,target);renamed=true;return verifyPairEvidence(target,io)
 }catch(error){if(!renamed)io.rmSync(stage,{recursive:true,force:true});throw error}
}

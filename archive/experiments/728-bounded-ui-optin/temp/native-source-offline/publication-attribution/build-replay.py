from pathlib import Path
s=Path('/home/suselman/projects/pencil-agents/680-water-wet-tone/docs/qa/harness/728-room-native400/controller.mjs').read_text()
s="import {replayOriginalGlControl,compareGlMaterialEndpoint} from './replay.mjs'\n"+s
s=s.replace("const carryPressure=process.env.QA_CARRY_HARDWARE_PRESSURE==='1';", "const carryPressure=false;if(process.env.QA_CARRY_HARDWARE_PRESSURE==='1')throw Error('Original GL reference forbids native pressure flag');")
needle="let target,ws,ownedContext,browserSession,seq=0;"
new="""if(!process.env.QA_REFERENCE_REPORT||!process.env.QA_REFERENCE_PNG)throw Error('Durable native report/material PNG required');const reference=JSON.parse(fs.readFileSync(process.env.QA_REFERENCE_REPORT,'utf8'));if(!reference.complete||reference.source!==report.source||reference.packedTape?.length!==4||reference.browserPaper?.sha256!==JSON.parse(fs.readFileSync(process.env.QA_ORIGIN_MANIFEST,'utf8')).paperLaSha256)throw Error('Same-source native four-operation passport required');const png=fs.readFileSync(process.env.QA_REFERENCE_PNG);if(png.length>2097152)throw Error('Reference PNG exceeds bounded2MiB transfer');const nativePng=png.toString('base64');report.reference={source:reference.source,export:reference.export,pngSha:crypto.createHash('sha256').update(png).digest('hex')};let target,ws,ownedContext,browserSession,seq=0;"""
assert needle in s;s=s.replace(needle,new)
s=s.replace("report.stage='native-init'", "report.stage='original-gl-init'")
s=s.replace("room+'?wcNative=1'+(carryPressure?'&wcCarryHardwarePressure=1':'')", "room+'?wcNative=0'")
start=s.index(' await evaluate(async()=>{const trace=window.__nativeInitTrace=')
end=s.index('\n await wait(()=>{const button=',start)
s=s[:start]+" await evaluate(()=>{window.__nativeInitTrace=[]})"+s[end:]
start=s.index(' await evaluate(()=>{const t=window.__room400Raf=')
end=s.index('\n report.packedTape=',start)
s=s[:start]+""" report.stage='original-gl-replay';save();const config=await evaluate(()=>{const e=window.__engine;if(e._layers.size!==1)throw Error('Single fresh layer required');return{targetLayerId:[...e._layers.keys()][0]}});report.replay=await evaluate(replayOriginalGlControl,{...config,tape:reference.packedTape,expectedBoard:{width:1754,height:2480},expectedPaperSha:reference.browserPaper.sha256,actualPaperSha:report.browserPaper.sha256});await idle();report.final=await census();if(report.final.native||report.final.error||report.final.lost||report.final.gl)throw Error('Original GL replay functional gate failed');report.endpointComparison=await evaluate(compareGlMaterialEndpoint,nativePng);save();"""+s[end:]
s=s.replace("report.primaryRaf", "report.unusedPrimaryRaf")
s=s.replace("report.instrumentationScope='Bounded existing-call observer; extra Promise microtasks and timestamps; no performance A/B claim'", "report.instrumentationScope='Original GL same packed replay; endpoint-only diagnostic, no timing A/B claim'")
Path('docs/qa/harness/728-room-native-replay-control/controller.mjs').write_text(s)

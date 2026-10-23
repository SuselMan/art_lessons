from pathlib import Path
s=Path('/home/suselman/projects/pencil-agents/680-water-wet-tone/docs/qa/harness/728-room-native400/controller.mjs').read_text();s="import {compareGlMaterialEndpoint} from './replay.mjs'\n"+s
s=s.replace("const carryPressure=process.env.QA_CARRY_HARDWARE_PRESSURE==='1';", "const carryPressure=false;if(process.env.QA_CARRY_HARDWARE_PRESSURE==='1')throw Error('Original GL live forbids nativepressure');")
r=Path('docs/qa/harness/728-room-native-replay-control/controller.mjs').read_text();a=r.index("if(!process.env.QA_REFERENCE_REPORT");b=r.index('let target,ws,ownedContext',a);prefix=r[a:b];s=s.replace('let target,ws,ownedContext',prefix+'let target,ws,ownedContext')
pos=s.index(" await evaluate(()=>{const input=document.querySelector('form input[type=text]')");s=s[:pos]+" await send('Page.navigate',{url:app+'/create?wcNative=0'});await wait(()=>!!document.querySelector('form input[type=text]'))\n"+s[pos:]
s=s.replace("room+'?wcNative=1'+(carryPressure?'&wcCarryHardwarePressure=1':'')","room+'?wcNative=0'")
a=s.index(' await evaluate(async()=>{const trace=window.__nativeInitTrace=');b=s.index('\n await wait(()=>{const button=',a);s=s[:a]+" await evaluate(()=>{window.__nativeInitTrace=[]})"+s[b:]
s=s.replace("if(!report.final.native||!report.final.ready||report.final.error||report.final.lost||report.final.gl)","if(report.final.native||report.final.error||report.final.lost||report.final.gl)")
needle=" report.packedTape=await evaluate(()=>window.__engine._log.entries.filter(x=>x.op.type==='stroke').map(x=>x.op));"
s=s.replace(needle,needle+"\n report.comparisonScope='SAME requested pen geometry/pressure/settings, newly generated dabs/timestamps/seeds; NOT exact packed-tape parity';report.endpointComparison=await evaluate(compareGlMaterialEndpoint,nativePng);if(report.endpointComparison.glPng)fs.writeFileSync(out+'/gl-material.png',Buffer.from(report.endpointComparison.glPng,'base64'));delete report.endpointComparison.glPng;if(report.endpointComparison.nativeSha!==reference.export.sha)throw Error('Native reference material differs exportSHA');save();")
s=s.replace("report.instrumentationScope='Bounded existing-call observer; extra Promise microtasks and timestamps; no performance A/B claim'","report.instrumentationScope='Original GL pointer geometry control; browserRAF andwallCPU notphysicalpen/GPUtime; no native instrumentation'")
s=s.replace("report.stage='native-init'","report.stage='original-gl-live-init'")
Path('docs/qa/harness/728-room-native-replay-control/live-controller.mjs').write_text(s)

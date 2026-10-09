import fs from 'node:fs'
export function summarizeCpuProfile(profile){
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),exclusive=new Map();let clock=profile.startTime,total=0
 if((profile.samples?.length??0)!==(profile.timeDeltas?.length??0))throw Error('CPU profile samples/timeDeltas mismatch')
 for(let i=0;i<(profile.samples?.length??0);i++){const us=profile.timeDeltas[i];if(!Number.isFinite(us)||us<0||!nodes.has(profile.samples[i]))throw Error('Invalid CPU profile sample');clock+=us;total+=us;exclusive.set(profile.samples[i],(exclusive.get(profile.samples[i])??0)+us)}
 const rows=profile.nodes.map(n=>({id:n.id,function:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1,exclusiveMs:(exclusive.get(n.id)??0)/1000,children:n.children??[]}));
 return{sampledMs:total/1000,startTimeUs:profile.startTime,endTimeUs:profile.endTime,sampleEndUs:clock,topExclusive:[...rows].sort((a,b)=>b.exclusiveMs-a.exclusiveMs).slice(0,30),nodes:rows,scope:'V8 CPU sampling attribution; idle/program/native frames are not GPU duration. Profiler changes scheduling; no uninstrumented performance A/B.'}
}
export async function startFirstWaterCpuProfile(send,readClock){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:1000});const before=await readClock();await send('Profiler.start');return{beforeStartBrowserMs:before,afterStartBrowserMs:await readClock()}}
export async function stopFirstWaterCpuProfile(send,readClock,out,started){const beforeStopBrowserMs=await readClock();const {profile}=await send('Profiler.stop');if(!profile?.nodes?.length)throw Error('Empty actual CPU profile');fs.writeFileSync(out+'/first-water.cpuprofile',JSON.stringify(profile));const result={...started,beforeStopBrowserMs,afterStopBrowserMs:await readClock(),...summarizeCpuProfile(profile)};fs.writeFileSync(out+'/first-water-cpu-summary.json',JSON.stringify(result,null,2));return result}

import fs from 'node:fs';
const results=[];
for(const label of ['pair1-on','pair1-off','pair2-off','pair2-on'])for(const scenario of ['densezigzag','burst']){
 const r=JSON.parse(fs.readFileSync(`temp/idle-batch/repeat-7322/${label}/${scenario}.json`));
 const enabled=label.endsWith('-on'),sync=r.batchSyncEvents||[];
 if(r.passport.idleBatch!==enabled||!r.passport.stamp.startsWith('7322'))throw Error('Passport mismatch');
 if(!r.postTimingControl.nonzeroAlpha||r.gl.error||r.gl.lost||r.errors.length||!r.settling.completed)throw Error('Case gate failed');
 if(!enabled&&sync.length)throw Error('OFF extra sync');
 if(sync.some(e=>e.jobAgeMs!==null&&e.jobAgeMs<250))throw Error('Grace early sync');
 if(scenario==='burst'&&sync.some(e=>e.phase!=='burst-3-settle'))throw Error('Extra sync in short burst pause/input');
 const phases=Object.fromEntries(Object.entries(r.frameStats).filter(([n])=>['active','active-settle','morph','settled-idle','background'].includes(n)||n.startsWith('burst-')));
 results.push({label,scenario,source:r.passport.stamp,renderer:r.passport.renderer,flags:r.passport.flags,baseline:r.frameStats.baseline,phases,relativeFrameRates:r.relativeFrameRates,longTasksOver200:r.longTasksOver200.length,loafMax:Math.max(0,...r.loaf.map(x=>x.ms||x.duration||0)),draws:r.draws,elements:r.elements,memory:{before:r.before,after:r.after},forcedSubmission:r.forcedSettleMs,latencies:r.latencies,settling:r.settling,sync:{n:sync.length,minAge:sync.filter(e=>e.jobAgeMs!==null).reduce((v,e)=>Math.min(v,e.jobAgeMs),Infinity)},gl:r.gl});
}
const ranges={};for(const mode of ['on','off'])for(const scenario of ['densezigzag','burst']){const group=results.filter(r=>r.label.endsWith('-'+mode)&&r.scenario===scenario);ranges[mode+'-'+scenario]={solverMs:group.map(r=>r.settling.solverIdleMs),revealIdleMs:group.map(r=>r.settling.ms),activeMax:group.map(r=>Math.max(...Object.entries(r.phases).filter(([n])=>n==='active'||/^burst-[123]$/.test(n)).map(([,s])=>s.max))),minSyncAge:group.map(r=>r.sync.minAge)};}
const report={ranges,order:['ON','OFF','OFF','ON'],results,limitation:'Two balanced observational pairs; no causalFPS or photon-latency claim. Fixed source pixel parity is a separate gate.'};
fs.writeFileSync('temp/idle-batch/repeat-7322-summary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

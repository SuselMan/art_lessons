import fs from 'node:fs';
const source=process.argv[2]||'7322';let result={};
for(const variant of ['off','on'])for(const name of ['densezigzag','burst']){
 const r=JSON.parse(fs.readFileSync(`temp/idle-batch/native-${source}-${variant}/${name}.json`));
 const sync=r.batchSyncEvents||[], phaseCounts={};for(const e of sync)phaseCounts[e.phase]=(phaseCounts[e.phase]||0)+1;
 if(variant==='off'&&sync.length)throw Error('Unexpected extra sync OFF');
 if(source==='7322'&&sync.some(e=>e.jobAgeMs!==null&&e.jobAgeMs<250))throw Error('Grace violated');
 result[variant+'-'+name]={source:r.passport.stamp,flags:r.passport.flags,mode:r.passport.idleBatch,frames:Object.fromEntries(Object.entries(r.frameStats).filter(([n])=>n==='active'||n.startsWith('burst-'))),baseline:r.frameStats.baseline,latencies:r.latencies,forced:r.forcedSettleMs,settling:r.settling,sync:{n:sync.length,minJobAgeMs:sync.some(x=>x.jobAgeMs!==null)?Math.min(...sync.filter(x=>x.jobAgeMs!==null).map(x=>x.jobAgeMs)):null,phaseCounts},gl:r.gl,ink:r.postTimingControl.nonzeroAlpha};
}
fs.writeFileSync(`temp/idle-batch/native-${source}-summary.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));

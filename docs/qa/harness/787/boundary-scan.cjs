// Isolated exact id/type projection of saved API input. Not a whole-engine replay.
const fs=require('fs'),{performance}=require('perf_hooks');
const report=JSON.parse(fs.readFileSync(process.argv[2]));const result=[];
for(const n of [100,300,1000]){const rows=report.cases.find(c=>c.count===n&&c.mode==='normal').input.idContentHashes,entries=rows.map(op=>({state:'done',op:{id:op.id,type:op.type,layerId:'L'}})),samples=[];let checksum=0;
 for(let run=0;run<6;run++){const at=performance.now();for(const recordedOp of entries.filter(e=>e.op.type==='stroke').map(e=>e.op)){const index=entries.findIndex(e=>e.op.id===recordedOp.id);const boundary=entries.slice(0,index<0?undefined:index).filter(e=>e.state==='done'&&(e.op.type==='paper_dry'&&(!e.op.layerId||e.op.layerId==='L')||e.op.type==='layer_visibility'&&!e.op.visible&&e.op.layerId==='L')).at(-1)?.op.id??'';checksum+=boundary.length}samples.push(performance.now()-at)}
 result.push({n,warmSamplesMs:samples.slice(1),checksum});
}console.log(JSON.stringify({scope:'index.ts _ribbonDabsWork recordedIndex+boundary only; no GL, actual recorded ids/types, no dry/hide, synthetic same-layer projection; VPS timings do not estimate Adreno or whole resolver',result},null,2));

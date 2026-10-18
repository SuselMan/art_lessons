'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const read=p=>JSON.parse(fs.readFileSync(p));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function stats(values){assert.ok(values.length>=3);assert.ok(values.every(v=>Number.isFinite(v)&&v>=0));const ordered=[...values].sort((a,b)=>a-b);return{median:ordered[Math.floor(ordered.length/2)],min:ordered[0],max:ordered.at(-1),samples:values}}
function summarize(root){
 const out={scope:'Vega native 1024×1024. GPU timeline elapsed, not shader-active utilization or pen-up latency.',scenes:[]};
 for(const id of ['mini-wave','mini-two-colors']){
  const file=path.join(root,'stages',id,'report.json'),r=read(file);
  assert.equal(r.pass,true);assert.equal(r.contextClosed,true);assert.equal(r.sourceStable,true);
  const groups=r.samples.filter(s=>s.mode==='groups'),whole=r.samples.filter(s=>s.mode==='whole');
  assert.ok(groups.length>=5&&whole.length>=5);assert.equal(groups.length,whole.length);
  const gStats=stats(groups.map(s=>s.gpu.totalGpuMs)),wStats=stats(whole.map(s=>s.gpu.totalGpuMs));
  const selected=[...groups].sort((a,b)=>a.gpu.totalGpuMs-b.gpu.totalGpuMs)[Math.floor(groups.length/2)];
  for(const sample of r.samples){assert.equal(sample.gpu.disjoint,false);assert.equal(sample.gpu.baselineCompared,true)}
  const baseline={};
  for(const phase of ['baseline','baseline-after']){const p=path.join(root,phase,id,'report.json'),b=read(p);assert.equal(b.pass,true);assert.equal(b.contextClosed,true);assert.equal(b.bootstrap.renderer,r.bootstrap.renderer);assert.deepEqual(b.sourceSHA,r.sourceSHA);assert.deepEqual(b.hashes[0],r.baseline.outputSHA);baseline[phase]={sha256:sha(p),wallMs:stats(b.samples.map(s=>s.totalToFullCMs))}}
  out.scenes.push({id,renderer:r.bootstrap.renderer,reportSHA256:sha(file),inputSHA:r.sourceSHA,outputSHA:r.baseline.outputSHA,wholeGpuMs:wStats,groupedGpuMs:gStats,groupedToWholeRatio:gStats.median/wStats.median,representative:{repeat:selected.repeat,totalGpuMs:selected.gpu.totalGpuMs,intervals:selected.gpu.intervals},groupMedians:selected.gpu.intervals.map((g,i)=>({id:g.id,label:g.label,...stats(groups.map(s=>{assert.equal(s.gpu.intervals[i].id,g.id);return s.gpu.intervals[i].gpuMs}))})),baseline});
 }
 return out;
}
if(require.main===module){const result=summarize(process.argv[2]);fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.scenes.map(s=>({id:s.id,whole:s.wholeGpuMs.median,groups:s.groupedGpuMs.median,ratio:s.groupedToWholeRatio,ranking:[...s.groupMedians].sort((a,b)=>b.median-a.median).map(g=>({id:g.id,ms:g.median}))}))))}
module.exports={summarize,stats};

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createPackage,addSnapshots,addHostTimings}=require('./package.cjs');
function buildData(evidence,nativeProofRoot,catalogPath,out){
 const manifest=JSON.parse(fs.readFileSync(path.join(evidence,'manifest.json')));
 function resolve(suffix){const matches=manifest.files.filter(f=>f.source.endsWith('/'+suffix));assert.equal(matches.length,1,'One archived '+suffix);const f=matches[0],full=path.join(evidence,f.archive);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'),f.sha256);return full}
 const specs=[{baseline:'baseline-matched',trace:'trace-warm-three',snapshots:['snapshots-replay','snapshots-extra']},{baseline:'two-colors-control-warm-three',trace:'two-colors-trace-warm-three',snapshots:['two-colors-snapshots','two-colors-snapshots-extra']}];let data;
 for(const spec of specs){
  const pack=createPackage({baselinePath:resolve(spec.baseline+'/report.json'),nativeProofRoot,catalogPath,out});
  for(const group of spec.snapshots){const index=resolve(group+'/snapshots/index.json'),doc=JSON.parse(fs.readFileSync(index));for(const snap of doc.index)resolve(group+'/snapshots/'+snap.path)}
  addSnapshots(pack,spec.snapshots.map(group=>resolve(group+'/snapshots/index.json')));addHostTimings(pack,resolve(spec.trace+'/report.json'));
  if(!data)data=pack.data;else{data.scenes.push(...pack.data.scenes);data.source.secondScene=pack.data.source;data.overview+=' '+pack.data.overview}
 }
 // Human-facing spacing only; never change hashes, measurements, image paths or source IDs.
 for(const scene of data.scenes)for(const track of scene.tracks)for(const stage of track.stages)for(const key of ['label','inputText','actionText','outputText','details','qualification','noImageReason'])if(typeof stage[key]==='string')stage[key]=stage[key].replace(/([а-яё])(\d)/gi,'$1 $2').replace(/(\d)([а-яё])/gi,'$1 $2');
 fs.writeFileSync(path.join(out,'data.json'),JSON.stringify(data,null,2));return{scenes:data.scenes.length,nativeStages:data.scenes.reduce((n,s)=>n+s.tracks[0].stages.length,0),images:new Set(data.scenes.flatMap(s=>[s.initial,s.final,...s.tracks.flatMap(t=>t.stages.flatMap(st=>[st.beforeImage,st.afterImage]))].filter(Boolean).map(i=>i.src))).size};
}
module.exports={buildData};if(require.main===module){assert.equal(process.argv.length,6,'Usage: node build-data.cjs evidence native-proof-root catalog-archived.json output-package');console.log(JSON.stringify(buildData(...process.argv.slice(2))))}

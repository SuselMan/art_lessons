import fs from 'node:fs';import {transform} from 'esbuild';import crypto from 'node:crypto';
const dir='temp/wc-runs/overnight-next/distance-add-source/';const actual=fs.readFileSync(dir+'actual-home-5288-module.js','utf8');const reports=[];
for(const id of ['production-distance-add-paired-linear-band','production-distance-add-paired-stamps-only']){
 const file=dir+id+'.json';const spec=JSON.parse(fs.readFileSync(file,'utf8'));const priorSHA=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');let js=actual;const counts=[];
 for(const p of spec.runtimePatches.filter(p=>p.kind==='vite-module-exact')){p.before=p.before.replace(' * 0.5 * ((1 - profile.stampInkShare)', ' * .5 * ((1 - profile.stampInkShare)');const count=js.split(p.before).length-1;counts.push(count);if(count!==p.countPerResponse)throw Error(id+' '+p.before+' count'+count);js=js.replace(p.before,p.after)}
 await transform(js,{loader:'js',format:'esm'});spec.guards.live5288Verified=true;spec.guards.live5288SequentialCounts=counts;spec.guards.actualBodySHA256=crypto.createHash('sha256').update(actual).digest('hex');fs.writeFileSync(file,JSON.stringify(spec,null,2));reports.push({id,priorSHA,newSHA:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),counts,jsParse:true});
}
fs.writeFileSync(dir+'actual-home-5288-anchor-audit.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));

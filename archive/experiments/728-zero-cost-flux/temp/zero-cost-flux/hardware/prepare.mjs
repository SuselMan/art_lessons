import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const ROOT=process.cwd(),OUT=path.join(ROOT,'temp/zero-cost-flux/hardware'),base='df41200e',source='57713c66';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of ['WatercolorPasses','shaders']){
 let text=execFileSync('git',['show',base+':apps/web/src/engine/src/raster/'+name+'.ts'],{encoding:'utf8'});
 text=text.replace(/from '(\.[^']+)'/g,(_,specifier)=>{
  if(name==='WatercolorPasses'&&specifier==='./shaders')return "from './old-shaders'";
  const absolute=path.posix.normalize('/src/engine/src/raster/'+specifier);return `from '${absolute}'`;
 });
 fs.writeFileSync(path.join(OUT,'old-'+name+'.ts'),text);
}
const fixture='/home/suselman/projects/pencil-agents/728-live-onset-current/temp/onset/sheet3-curated42.json';
const raw=fs.readFileSync(fixture);if(sha(raw)!=='ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9')throw Error('Curated42 source hash mismatch');
fs.copyFileSync(fixture,path.join(OUT,'full-journal.json'));
const files=execFileSync('git',['ls-files','apps/web/src','packages/shared/src'],{encoding:'utf8'}).trim().split('\n').map(file=>({file,sha256:sha(fs.readFileSync(path.join(ROOT,file)))}));
const manifest={source,base,fixtureSHA:sha(raw),files,helpers:['full-journal-function.js','mixed-colour-function.js','checkpoint-function.js','sha256-browser-function.js','old-WatercolorPasses.ts','old-shaders.ts','full-journal.json'].map(file=>({file,sha256:sha(fs.readFileSync(path.join(OUT,file)))}))};
fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,2));
for(const file of ['full-journal-function.js','checkpoint-function.js','sha256-browser-function.js'])new Function('return '+fs.readFileSync(path.join(OUT,file),'utf8'));
console.log(JSON.stringify({source,files:files.length,fixtureSHA:manifest.fixtureSHA,helperSyntax:true}));

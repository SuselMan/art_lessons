// ReviewOnly. GPU execution requires root authorization; no production requests.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [inputs,out,spec]=process.argv.slice(2);if(!inputs||!out||!spec)throw Error('inputs out spec required');
if(process.env.QA_PARITY_APPROVED!=='1')throw Error('ReviewOnly: root approval flag required');
const child=new URL('./fresh-parity-child-review.mjs',import.meta.url).pathname;
mkdirSync(out,{recursive:true});const runs=[];
for(const mode of ['append-a','append-b','rebuild']){
 const dir=out+'/'+mode;const r=spawnSync(process.execPath,[child,inputs,dir,spec],{env:{...process.env,QA_ALLOW_PATCHES:'1',QA_PARITY_REBUILD:mode==='rebuild'?'1':'0'},encoding:'utf8'});
 writeFileSync(out+'/'+mode+'.log',r.stdout+'\n'+r.stderr);if(r.status!==0)throw Error(mode+' invalid; inspect durable log');
 runs.push({mode,dir,report:JSON.parse(readFileSync(dir+'/report.json'))});
}
const comparisons=[];for(const c of runs[0].report.cases){for(const r of runs.slice(1)){
 const other=r.report.cases.find(x=>x.id===c.id);if(!other)throw Error('case mismatch');
 const tiles=dir=>Object.entries(JSON.parse(readFileSync(dir+'/'+c.id+'-composite-fields.json'))).map(([key,f])=>({key,sha:f.sha256,origin:f.origin,width:f.width,height:f.height})).sort((a,b)=>a.key.localeCompare(b.key));
 const sha=dir=>createHash('sha256').update(readFileSync(dir+'/'+c.id+'.png')).digest('hex');
 const frames=dir=>JSON.parse(readFileSync(dir+'/'+c.id+'-phase-fields.json')).frames.map(x=>({stage:x.stage,role:x.role,sha256:x.sha256,width:x.width,height:x.height,mapping:x.mapping}));
 comparisons.push({case:c.id,mode:r.mode,pngEqual:sha(r.dir)===sha(runs[0].dir),rawEqual:JSON.stringify(frames(r.dir))===JSON.stringify(frames(runs[0].dir)),tileRecordsEqual:JSON.stringify(tiles(r.dir))===JSON.stringify(tiles(runs[0].dir)),original:frames(runs[0].dir),compared:frames(r.dir)});
}}
writeFileSync(out+'/parity-review.json',JSON.stringify({complete:true,comparisons,pass:comparisons.every(x=>x.pngEqual&&x.rawEqual&&x.tileRecordsEqual),scope:'fresh append-repeat and actual undo/redo rebuild, not pointer-event live parity'},null,2));

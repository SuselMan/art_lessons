import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../../../',import.meta.url));const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]);
const inputs=files(path.join(root,'packages/shared/src')).sort().map(p=>({path:path.relative(root,p),sha256:sha(p)}));
const arms=[];
for(const [arm,id]of [['0','gl-shared-reference-cpu'],['1','gl-shared-prebundle-cpu']]){
 const cache=path.join(process.env.HOME,'.cache/codex-qa',id);process.env.SERVER_PORT='4558';process.env.QA_CACHE_ROOT=cache;process.env.QA_SHARED_PREBUNDLE=arm;
 const server=await createServer({configFile:path.join(root,'docs/qa/harness/728-gl-timing/vite.shared-qa.config.mts'),mode:'qa-shared',server:{watch:null}});
 try{
  const transformed=await server.transformRequest('/src/components/LayerPanel/LayerRow.tsx');const optimizedImport=Boolean(transformed?.code.includes('@grafetto_shared.js'));if(optimizedImport!==(arm==='1'))throw Error('Actual transformed shared import arm mismatch');const meta=JSON.parse(fs.readFileSync(path.join(cache,'vite-cache/deps/_metadata.json'),'utf8'));const shared=meta.optimized['@grafetto/shared'];
  if((arm==='1')!==Boolean(shared))throw Error('Arm optimized metadata mismatch');if(shared&&path.resolve(cache,'vite-cache/deps',shared.src)!==path.join(root,'packages/shared/src/index.ts'))throw Error('Foreign shared source');
  if(server.config.isProduction||server.config.define?.['import.meta.env.DEV']!==undefined)throw Error('Changed DEV semantics');
  const artifacts=files(path.join(cache,'vite-cache/deps')).sort().map(p=>({path:path.relative(cache,p),sha256:sha(p)}));
  arms.push({arm,dev:true,root:server.config.root,shared:shared??null,artifacts,mainTransformed:Boolean(transformed),optimizedImport,scope:'local optimizer/transform; browser consumption not yet proven'});
 }finally{await server.close()}
}
const manifest={selectedWorktree:root,inputs,tool:{node:process.version,vite:JSON.parse(fs.readFileSync(path.join(root,'node_modules/vite/package.json'))).version,lockSHA256:sha(path.join(root,'package-lock.json'))},config:['SharedQaConfig.mjs','vite.shared-qa.config.mts'].map(n=>({path:n,sha256:sha(path.join(root,'docs/qa/harness/728-gl-timing',n))})),arms};
fs.writeFileSync(path.join(root,'docs/qa/harness/728-gl-timing/shared-prebundle-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({inputs:inputs.length,arms:arms.map(a=>({arm:a.arm,shared:!!a.shared,mainTransformed:a.mainTransformed})),scope:'CPU only; no listener/device/room input'}));

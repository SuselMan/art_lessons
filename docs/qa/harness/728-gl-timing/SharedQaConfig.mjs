import path from'node:path';import fs from'node:fs';import os from'node:os';
/** Separate serve-only QA authority. Never imported by product vite.config. */
export function sharedQaConfig({command,mode,sourceRoot,cacheRoot,prebundle}){
 if(command!=='serve'||mode!=='qa-shared'||!['0','1'].includes(prebundle))throw Error('Explicit serve-only QA prebundle arm required');
 const root=fs.realpathSync(sourceRoot),cache=path.resolve(cacheRoot??''),allowed=path.join(os.homedir(),'.cache','codex-qa');
 if(path.dirname(cache)!==allowed||fs.realpathSync(cache)!==cache)throw Error('Registered isolated cache root required');
 const marker=JSON.parse(fs.readFileSync(path.join(cache,'.codex-qa-disposable.json'),'utf8'));if(marker.id!==path.basename(cache)||marker.path!==cache)throw Error('Cache marker mismatch');
 const shared=path.join(root,'packages/shared/src/index.ts');if(!fs.statSync(shared).isFile())throw Error('Selected shared source required');
 return{root:path.join(root,'apps/web'),cacheDir:path.join(cache,'vite-cache'),resolve:{alias:[{find:/^@grafetto\/shared$/,replacement:shared}]},optimizeDeps:{...(prebundle==='1'?{include:['@grafetto/shared']}:{})}};
}

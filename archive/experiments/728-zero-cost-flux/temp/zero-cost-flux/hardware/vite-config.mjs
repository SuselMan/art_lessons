import path from 'node:path';
const root='/home/suselman/projects/pencil-agents/728-zero-cost-flux-runtime';
const deps='/home/suselman/projects/pencil-agents/680-water-wet-tone-qa';
export default {
 root:path.join(root,'apps/web'),
 publicDir:path.join(deps,'apps/web/public'),
 cacheDir:path.join(root,'temp/vite-cache'),
 resolve:{alias:[
 {find:'@grafetto/shared',replacement:path.join(root,'packages/shared/src/index.ts')},
 {find:'lodash-es',replacement:path.join(deps,'node_modules/lodash-es/lodash.js')},
 {find:'nanoid',replacement:path.join(deps,'node_modules/nanoid/index.js')},
 {find:'fflate',replacement:path.join(deps,'node_modules/fflate/esm/browser.js')},
 ]},
 server:{host:'0.0.0.0',port:5331,strictPort:true,fs:{allow:[root,deps]},watch:{ignored:['**/temp/**']}}
}

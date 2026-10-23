import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const root=process.env.WC_RELEASE_ROOT;if(!root)throw Error('explicit source root');
const passport=JSON.parse(readFileSync(root+'/source-passport.json','utf8'));
export default defineConfig({root,publicDir:resolve(root,'public'),define:{'import.meta.env.VITE_WC_REVIEW':'"0"','import.meta.env.VITE_WC_FOREIGN_REVIEW':'"0"'},plugins:[{name:'revision-shared',enforce:'pre',resolveId(id,importer){if(id==='@grafetto/shared'){const v=passport.versions.find(v=>importer?.includes('/sources/'+v.name+'/'));if(!v)throw Error('shared import without revision');return resolve(root,'sources',v.name,'packages/shared/src/index.ts')}}}],server:{host:'0.0.0.0',port:5335,strictPort:true,fs:{allow:[root,process.env.WC_DEPS_ROOT].filter(Boolean)},watch:{ignored:['**/public/**']}}});

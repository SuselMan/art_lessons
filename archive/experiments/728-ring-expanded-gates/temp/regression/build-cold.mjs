import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire('/home/suselman/projects/pencil-agents/680-water-wet-tone-qa/package.json');
const {build}=require('esbuild');
for(const [name,path] of [['base','current-c092/apps/web/src/engine/src/raster/shaders.ts'],['clean','current-clean894/apps/web/src/engine/src/raster/shaders.ts'],['gradient','current-clean894/apps/web/src/engine/src/watercolor/gradientFibres.ts']]){
  await build({entryPoints:['sources/'+path],outfile:'cold-'+name+'.mjs',bundle:true,platform:'node',format:'esm'});
}
const base=await import('./cold-base.mjs'),clean=await import('./cold-clean.mjs'),gradient=await import('./cold-gradient.mjs');
const fragments=[['baseline-diffuse',base.WC_DIFFUSE_FRAG],['clean894-diffuse',clean.WC_DIFFUSE_FRAG],['clean894-baked',gradient.withGradientFibres(clean.WC_FIELD_OP_FRAG)]];
const hashes=Object.fromEntries(fragments.map(([n,s])=>[n,{bytes:s.length,SHA256:createHash('sha256').update(s).digest('hex')}]));
writeFileSync('cold-input.json',JSON.stringify({source:'c092+65d2546b+894ec09c',vertex:clean.DISPLAY_VERT,fragments,hashes}));
console.log(JSON.stringify(hashes));

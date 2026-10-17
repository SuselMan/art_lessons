'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {transformNativeFeatherSource:n,transformPrefixFeatherSource:p,transformFrontFeatherPair:pair}=require('./native-feather-approx.cjs');
const root=path.resolve(__dirname,'../../../../..');
const native=fs.readFileSync(path.join(root,'apps/web/src/engine/src/raster/shaders.ts'),'utf8');
const prefix=fs.readFileSync(path.join(root,'apps/web/src/engine/src/raster/WatercolorFrontPaths.ts'),'utf8');
test('actual modules: only the two front call names change; all other bytes survive',()=>{
 const out=pair(native,prefix);
 assert.equal(out.native.replace('wcNoise((px + u_paperOrigin) * WC_FRONT_FEATHER_SCALE','wcFbm((px + u_paperOrigin) * WC_FRONT_FEATHER_SCALE'),native);
 assert.equal(out.prefix.replace('wcNoise((px+u_paperOrigin)*WC_FRONT_FEATHER_SCALE','wcFbm((px+u_paperOrigin)*WC_FRONT_FEATHER_SCALE'),prefix);
 assert(out.native.includes('return 0.63 * wcNoise(p) + 0.37 * wcNoise(p * 2.7 + vec2(31.4, 17.9));'));
 assert(Object.isFrozen(out));
});
test('extracted native shader template and prefix unitEdge GLSL accepted',()=>{
 const glsl=native.match(/export const WC_WATER_FRONT_FRAG = `([\s\S]*?)\n`;/)[1];
 assert(n(glsl).includes('wcNoise((px + u_paperOrigin)'));
 const packing=prefix.slice(prefix.indexOf('const packing = `'),prefix.indexOf('const buildShader'));
 assert(p(packing).includes('wcNoise((px+u_paperOrigin)'));
});
test('reapply, duplicate, missing and coordinate drift fail closed on either half',()=>{
 for(const [fn,source] of [[n,native],[p,prefix]]){
  assert.throws(()=>fn(fn(source))); assert.throws(()=>fn(source+source));assert.throws(()=>fn(''));assert.throws(()=>fn(source.replace(/41\.0/g,'42.0')));assert.throws(()=>fn(null));
 }
 assert.throws(()=>pair(native,p(prefix)));assert.throws(()=>pair(n(native),prefix));
});

import test from 'node:test'
import assert from 'node:assert/strict'
// Raw asset imports belong to esbuild browser bundle; inspect shader anchor source without evaluating noise asset.
import {readFileSync} from 'node:fs'
test('diagnostic anchored output preserves production coverage body',()=>{
 const source=readFileSync('docs/qa/harness/728-native-end-to-end/stampDebug.ts','utf8'),native=readFileSync('apps/web/src/engine/src/webgpuCanonical/stamp.ts','utf8'),gl=readFileSync('apps/web/src/engine/src/raster/shaders.ts','utf8')
 for(const name of ['nativeReturn','glReturn']){const anchor=source.match(new RegExp("const "+name+"='([^']+)'"))![1];assert.ok((name==='nativeReturn'?native:gl).includes(anchor))}
 assert.match(source,/Q8 observations cannot prove sub-byte float equivalence/)
})

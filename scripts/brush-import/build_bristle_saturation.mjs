import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
const entry=fileURLToPath(new URL('./compile_bristle_saturation.ts',import.meta.url))
await build({entryPoints:[entry],outfile:fileURLToPath(new URL('./compile_bristle_saturation.mjs',import.meta.url)),bundle:true,platform:'node',target:'node20',format:'esm',metafile:true,plugins:[{name:'deny-protected',setup(b){b.onResolve({filter:/sourceDefaultAutoVectorShader/},()=>{throw Error('Protected source denied')})}}]})

import {defineConfig} from 'vite'
import {fileURLToPath} from 'node:url'
export default defineConfig({
 resolve:{alias:{'@grafetto/shared':fileURLToPath(new URL('../../packages/shared/src/index.ts',import.meta.url))}},
 server:{host:'0.0.0.0',port:5325,strictPort:true},
})

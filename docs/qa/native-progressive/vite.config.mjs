import {defineConfig} from 'vite';import {resolve} from 'node:path';
export default defineConfig({root:resolve('.'),build:{outDir:resolve('temp/progressive-dist'),emptyOutDir:true,rollupOptions:{input:resolve('docs/qa/native-progressive/index.html')}}});

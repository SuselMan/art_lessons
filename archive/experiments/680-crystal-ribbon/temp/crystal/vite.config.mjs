import {defineConfig} from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:5317,strictPort:true,hmr:false},define:{__SENTRY_DEBUG__:false,__SENTRY_TRACING__:false}});

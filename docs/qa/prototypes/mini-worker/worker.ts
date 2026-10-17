import {createMiniRuntime} from './runtime'
let runtime:Awaited<ReturnType<typeof createMiniRuntime>>|null=null
const send=(row:any)=>self.postMessage(row)
self.addEventListener('error',event=>send({type:'error',message:event.message}))
self.addEventListener('unhandledrejection',event=>send({type:'error',message:String(event.reason?.stack??event.reason)}))
self.onmessage=async({data})=>{try{if(data.type==='init'){if(runtime)throw Error('Worker already initialized');runtime=await createMiniRuntime(data.canvas,data.settings,data.hardware,send)}else if(data.type==='destroy'){runtime?.destroy();runtime=null;send({type:'destroyed'})}else if(runtime)runtime.handle(data)}catch(error){send({type:'error',message:String((error as Error).stack??error)})}}

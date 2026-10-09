import fs from 'node:fs'
export const TRACE_CAP_BYTES=16*1024*1024
export function validateTraceChunk(chunk,total){const bytes=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');if(total+bytes.length>TRACE_CAP_BYTES)throw Error('First-water trace exceeds16MiB cap');return bytes}
export async function startFirstWaterTrace(send,readClock){const beforeStartBrowserMs=await readClock();await send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',traceConfig:{recordMode:'recordUntilFull',includedCategories:['devtools.timeline','v8','gpu','toplevel','blink.user_timing'],excludedCategories:['disabled-by-default-devtools.screenshot']}});return{beforeStartBrowserMs,afterStartBrowserMs:await readClock(),scope:'Chromium timeline trace observer; GPU categories may omit cross-process work. Wall/native spans are not hardware timestamp GPU duration.'}}
export async function stopFirstWaterTrace(send,readClock,ws,out,started){
 const beforeStopBrowserMs=await readClock();let listener,timer
 const complete=new Promise((resolve,reject)=>{listener=raw=>{const event=JSON.parse(raw);if(event.method==='Tracing.tracingComplete')resolve(event.params)};ws.on('message',listener);timer=setTimeout(()=>reject(Error('Bounded tracingComplete timeout')),15000)})
 complete.catch(()=>{}) // preserve bounded rejection even if Tracing.end fails first
 let handle,bytes=0;const filename=out+'/first-water-trace.json',fd=fs.openSync(filename,'wx',0o600)
 try{
  await send('Tracing.end');const result=await complete;handle=result.stream;if(!handle)throw Error('Trace stream absent')
  while(true){const chunk=await send('IO.read',{handle,size:65536});const buffer=validateTraceChunk(chunk,bytes);fs.writeSync(fd,buffer);bytes+=buffer.length;if(chunk.eof)break}
  return{...started,beforeStopBrowserMs,afterStopBrowserMs:await readClock(),bytes,dataLossOccurred:!!result.dataLossOccurred,filename:'first-water-trace.json'}
 }finally{clearTimeout(timer);ws.off('message',listener);fs.closeSync(fd);if(handle)await send('IO.close',{handle}).catch(()=>{})}
}

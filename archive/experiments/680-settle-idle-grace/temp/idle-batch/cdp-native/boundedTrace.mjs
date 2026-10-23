import {writeFileSync,createWriteStream} from 'node:fs';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {finished} from 'node:stream/promises';
const bounded=async(p,ms,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label)),ms))])}finally{clearTimeout(timer)}};
export async function startBoundedTrace(browser,page,out,{durationMs=10000,maxBytes=16*1024*1024}={}){
 const cdp=await browser.newBrowserCDPSession();
 const {categories:available}=await cdp.send('Tracing.getCategories');
 const preferred=['devtools.timeline','v8','cc','gpu','viz','blink.user_timing'];
 const categories=preferred.filter(x=>available.includes(x));
 const metadata={durationMs,maxBytes,bufferKiB:8192,available,categories,startedAt:new Date().toISOString(),limitation:'Browser/renderer/GPU-service/compositor task trace; GPU category presence does not imply hardware GPU duration or photon measurement. Observer overhead remains.'};
 writeFileSync(out+'/trace-metadata.json',JSON.stringify(metadata,null,2));
 let completedResolve;const completed=new Promise(resolve=>{completedResolve=resolve});
 cdp.once('Tracing.tracingComplete',event=>completedResolve(event));
 await cdp.send('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{recordMode:'recordUntilFull',includedCategories:categories,traceBufferSizeInKb:8192}});
 metadata.clock=await page.evaluate(()=>{const name='wc-native-causal-clock';performance.mark(name);return{name,markStart:performance.getEntriesByName(name).at(-1).startTime,timeOrigin:performance.timeOrigin}});
 writeFileSync(out+'/trace-metadata.json',JSON.stringify(metadata,null,2));
 let stopping;
 const stop=()=>stopping??=(async()=>{
  await cdp.send('Tracing.end');
  const event=await bounded(completed,15000,'Trace drain deadline15s');
  if(!event.stream)throw Error('Trace returned no stream');
  const output=createWriteStream(out+'/trace.json.gz',{flags:'wx'}),gzip=createGzip({level:1});
  let bytes=0,decodedBytes=0,truncated=false,streamError;
  const completion=finished(output);completion.catch(()=>{});
  gzip.on('error',error=>{streamError=error;output.destroy(error)});
  output.on('error',error=>{streamError=error;gzip.destroy(error)});
  gzip.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){truncated=true;gzip.destroy(Error('Compressed trace cap16MiB'))}});
  gzip.pipe(output);
  try{for(;;){
   if(streamError)throw streamError;
   const item=await bounded(cdp.send('IO.read',{handle:event.stream,size:256*1024}),5000,'IO.read deadline5s');
   const data=Buffer.from(item.data,item.base64Encoded?'base64':'utf8');decodedBytes+=data.length;
   if(decodedBytes>64*1024*1024){truncated=true;throw Error('Decoded trace cap64MiB')}
   if(!gzip.write(data))await bounded(once(gzip,'drain'),5000,'gzip drain deadline5s');
   if(item.eof)break;
  }
  gzip.end();await bounded(completion,5000,'gzip finish deadline5s');
  }catch(error){gzip.destroy(error);output.destroy(error);throw error}
  finally{await cdp.send('IO.close',{handle:event.stream}).catch(()=>{});Object.assign(metadata,{bytes,decodedBytes,truncated});writeFileSync(out+'/trace-metadata.json',JSON.stringify(metadata,null,2))}
  Object.assign(metadata,{finishedAt:new Date().toISOString(),bytes,truncated});writeFileSync(out+'/trace-metadata.json',JSON.stringify(metadata,null,2));
 })();
 const timer=setTimeout(()=>{stop().catch(error=>writeFileSync(out+'/trace-error.json',JSON.stringify({message:String(error),stack:error.stack})))},durationMs);
 return {async close(){clearTimeout(timer);try{await stop()}finally{await cdp.detach()}},metadata};
}

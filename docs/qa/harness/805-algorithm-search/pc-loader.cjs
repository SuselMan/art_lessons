'use strict';
// Standalone PC adapter: shared Samsung loader/runner files stay untouched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readBuild,resourceName,hash}=require('./owned-loader.cjs');
const WebSocket=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/ws');
function endpointURL(value){const u=new URL(value);assert.equal(u.protocol,'http:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Explicit loopback CDP forward required');assert.ok(!u.username&&!u.password&&!u.search&&!u.hash);return u}
async function openOwned(buildDirectory,options={}){
 const endpoint=endpointURL(options.cdpEndpoint||process.env.QA_PC_CDP_ENDPOINT||''),accessFile=options.accessFile||process.env.QA_PC_ACCESS_FILE;
 assert.ok(accessFile,'QA_PC_ACCESS_FILE required (private; never print its URL)');
 const lifetime=Number(options.lifetimeMs??process.env.QA_PC_CONTEXT_TTL_MS??600000);assert.ok(Number.isFinite(lifetime)&&lifetime>=1000&&lifetime<=1800000,'Context TTL1s..30min');
 const build=readBuild(buildDirectory),fetchImpl=options.fetch||fetch,WS=options.WebSocket||WebSocket;
 const version=await(await fetchImpl(new URL('/json/version',endpoint))).json(),socketURL=new URL(version.webSocketDebuggerUrl);socketURL.host=endpoint.host;socketURL.protocol='ws:';
 const ws=new WS(socketURL.href);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 let id=0,context,target,session,closing,closed=false,ttl;const pending=new Map(),errors=[],intercepts={};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{if(closed)return reject(Error('Owned CDP closed'));const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method))},30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params,...sessionId?{sessionId}:{}}))});
 const page=(method,params={})=>send(method,params,session);
 const close=()=>closing??=(async()=>{try{if(target)await send('Target.closeTarget',{targetId:target})}finally{try{if(context)await send('Target.disposeBrowserContext',{browserContextId:context})}finally{closed=true;clearTimeout(ttl);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Owned CDP closed'))}pending.clear();ws.close()}}})();
 let access;
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{errors.push('Invalid CDP message');return}if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error('CDP '+(m.error.message||m.error.code))):p.resolve(m.result)}return}if(m.sessionId!==session)return;
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
  if(m.method==='Fetch.requestPaused'){const request=m.params;let name,bytes;try{const u=new URL(request.request.url);assert.equal(u.origin,access.origin,'Foreign resource origin');name=resourceName(u.pathname);bytes=build.files.get(name);assert.ok(bytes,'Unmanifested resource')}catch{errors.push('Blocked unexpected owned resource');page('Fetch.failRequest',{requestId:request.requestId,errorReason:'BlockedByClient'}).catch(()=>{});return}intercepts[name]=(intercepts[name]||0)+1;page('Fetch.fulfillRequest',{requestId:request.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':/\.(bin|paper|preview)$/.test(name)?'application/octet-stream':'application/javascript'},{name:'Cache-Control',value:'no-store'}],body:bytes.toString('base64')}).catch(()=>errors.push('Owned resource fulfillment failed'))}
 });
 try{
  context=(await send('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId;
  access=new URL(JSON.parse(fs.readFileSync(accessFile)).url);assert.equal(access.protocol,'https:','Secure private origin required');
  const gate=await fetchImpl(access,{redirect:'manual'}),cookies=gate.headers.getSetCookie().map(raw=>{const pair=raw.split(';')[0],at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:access.origin,path:'/',secure:true,httpOnly:true}});assert.ok(cookies.length,'Private gate cookie missing');await send('Storage.setCookies',{cookies,browserContextId:context});
  target=(await send('Target.createTarget',{url:'about:blank',browserContextId:context})).targetId;session=(await send('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;
  await page('Page.enable');await page('Runtime.enable');await page('Fetch.enable',{patterns:[{urlPattern:'*/watercolor-worker-802/*',requestStage:'Request'},...(build.files.has('paper/manifest.json')?[{urlPattern:'*/paper/*',requestStage:'Request'}]:[])]});
  if(options.bringToFront!==false)await page('Page.bringToFront');
  ttl=setTimeout(()=>{errors.push('Owned context TTL expired');close().catch(()=>{})},lifetime);ttl.unref?.();
  return{page,errors,intercepts,sourceHashes:build.hashes,browserMetadata:{product:version.Browser,protocolVersion:version['Protocol-Version'],qualification:'Owned PC browser context; renderer/hardware must come from actual worker result, not browser metadata'},navigate:query=>page('Page.navigate',{url:new URL('/watercolor-worker-802/?'+(query||''),access.origin).href}),evaluate:async expression=>{const r=await page('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value},verifySource:()=>assert.deepEqual(readBuild(buildDirectory).hashes,build.hashes),close};
 }catch(error){await close();throw error}
}
module.exports={openOwned,endpointURL,hash};
if(require.main===module)throw Error('Adapter only; execute pc-flow-run.cjs with explicit private configuration');

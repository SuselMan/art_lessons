// Android raw-CDP transport for the EXACT browser function in native-paged-ab.cjs.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),WS=require('ws');
(async()=>{const env=process.env,output=env.QA_OUTPUT;fs.mkdirSync(output,{recursive:true});const version=await(await fetch(env.QA_CDP+'/json/version')).json();let ws,context,target,session,sequence=0;const pending=new Map(),errors=[];
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},180000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}))});
 try{
  ws=new WS(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
  ws.on('message',raw=>{const value=JSON.parse(raw);if(value.id){const item=pending.get(value.id);if(item){pending.delete(value.id);clearTimeout(item.timer);value.error?item.reject(Error(JSON.stringify(value.error))):item.resolve(value.result)}}else if(value.method==='Runtime.exceptionThrown')errors.push(value.params.exceptionDetails)});
  context=(await send('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId;
  target=(await send('Target.createTarget',{url:'about:blank',browserContextId:context})).targetId;
  session=(await send('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;
  await send('Page.enable',{},session);await send('Runtime.enable',{},session);await send('Page.bringToFront',{},session);await send('Page.navigate',{url:env.QA_BASE_URL},session);
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
  for(let i=0;i<100;i++){if(await evaluate('location.origin==='+JSON.stringify(env.QA_BASE_URL.replace(/\/$/,''))+'&&document.readyState!=="loading"'))break;await new Promise(r=>setTimeout(r,100));if(i===99)throw Error('Own QA page did not load')}
  const source=fs.readFileSync(path.join(__dirname,'native-paged-ab.cjs'),'utf8'),start='const result=await page.evaluate(async()=>{',end='\n });\n const report=';
  assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);const code='(async()=>{'+source.split(start)[1].split(end)[0]+'})()';
  for(const[flag,name]of [['QA_POINT_FRONT','PointFront'],['QA_POINT_FIELD','PointField'],['QA_POINT_DIFFUSE','PointDiffuse'],['QA_MANUAL_MODE6','ManualMode6']])await evaluate('globalThis.__qa747'+name+'='+JSON.stringify(env[flag]==='1'));const result=await evaluate(code),report={source:env.QA_SOURCE,transport:'raw Android CDP; exact shared browser function',...result,errors};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  assert.equal(errors.length,0);assert.equal(result.reference.gl,0);assert.equal(result.actual.gl,0);assert.equal(result.lost,false);for(const d of Object.values(result.diffs))assert.equal(d.changed,0,'Material A/B difference');
 }finally{try{if(target)await send('Target.closeTarget',{targetId:target});if(context)await send('Target.disposeBrowserContext',{browserContextId:context})}finally{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Disposed own CDP transport'))}ws?.close()}}
})().catch(e=>{console.error(e);process.exitCode=1});

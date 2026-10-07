/** QA only, scoped to one owned WebGL instance. No GL queries, fences or prototypes. */
export function installUploadProvenance(gl,{enabled=false,maxRecords=64,maxBytes=16*1024*1024,domain=()=>null,freshOwnedCanvas=false,digest=bytes=>crypto.subtle.digest('SHA-256',bytes)}={}){
  const rows=[],pending=[],restore=[];let budget=0,truncated=false,unit=freshOwnedCanvas?gl.TEXTURE0:null,disposed=false;
  if(!enabled)return{rows,textureId:()=>null,ready:async()=>rows,summary:()=>({enabled:false}),dispose(){}};
  for(const name of ['activeTexture','bindTexture','texImage2D','texSubImage2D'])if(typeof gl[name]!=='function')throw Error('actual GL upload seam absent '+name);
  const unpack={};const bindings=new Map(),samplers=new WeakMap(),ids=new WeakMap();let next=1;
  const id=t=>{if(!t)return null;if(!ids.has(t))ids.set(t,next++);return ids.get(t)};
  const key=target=>unit+':'+target;
  function wrap(name,around){const original=gl[name];if(typeof original!=='function')throw Error('actual GL upload seam absent '+name);const wrapped=function(...args){return around.call(this,original,args)};gl[name]=wrapped;restore.push(()=>{if(gl[name]===wrapped)gl[name]=original})}
  // Shadow records returned calls only; WebGL acceptance is unverified (errors need not throw).
  if(typeof gl.pixelStorei==='function')wrap('pixelStorei',function(original,args){const result=original.apply(this,args);unpack[args[0]]=args[1];return result});
  wrap('activeTexture',function(original,args){const result=original.apply(this,args);unit=args[0];return result});
  wrap('bindTexture',function(original,args){const result=original.apply(this,args);bindings.set(key(args[0]),args[1]);return result});
  for(const name of ['texParameteri','texParameterf'])if(typeof gl[name]==='function')wrap(name,function(original,args){const result=original.apply(this,args),texture=bindings.get(key(args[0]));if(texture){let values=samplers.get(texture);if(!values)samplers.set(texture,values={});values[args[1]]=args[2]}return result});
  for(const name of ['texImage2D','texSubImage2D'])wrap(name,function(original,args){
    if(disposed||rows.length>=maxRecords){truncated=true;return original.apply(this,args)}
    const target=args[0],boundObserved=bindings.has(key(target)),texture=bindings.get(key(target));
    const typedOverload=args.length>=9,source=args[typedOverload?8:name==='texImage2D'?5:6];
    let capturedDomain=null;try{capturedDomain=domain()}catch{}
    const view=ArrayBuffer.isView(source),record={ordinal:rows.length,method:name,target,unit,texture:id(texture),unitKnown:unit!==null,bindingKnown:boundObserved,actuallyBound:!!texture,samplerObserved: texture?{...(samplers.get(texture)??{})}:null,domain:capturedDomain,args:args.slice(0,typedOverload?8:name==='texImage2D'?5:6),sourceKind:view?source.constructor.name:source===null?'allocation-null':typeof source,byteOffset:view?source.byteOffset:null,byteLength:view?source.byteLength:null,callReturned:false,GLacceptanceUnverified:true,capturedCPUViewKnown:false,unpackObserved:{...unpack},texelInterpretationKnown:false};
    let owned=null;
    if(args.length>9){record.reason='source-offset overload not covered';}else if(view){try{if(budget+source.byteLength<=maxBytes){owned=new Uint8Array(source.byteLength);owned.set(new Uint8Array(source.buffer,source.byteOffset,source.byteLength));budget+=owned.byteLength}else{record.reason='bounded byte budget';truncated=true}}catch(error){record.reason='unreadable or detached view';record.captureError=String(error)}}else record.reason='image/null source bytes unavailable';
    rows.push(record);
    try{const result=original.apply(this,args);record.callReturned=true;return result}
    catch(error){record.uploadError=String(error);throw error}
    finally{if(owned){const task=Promise.resolve().then(()=>digest(owned)).then(hash=>{record.exactViewSHA=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');record.capturedCPUViewKnown=true;}).catch(error=>{record.reason='digest failed';record.digestError=String(error)});pending.push(task)}}
  });
  return{rows,textureId:id,ready:async()=>{await Promise.all(pending);return rows},summary:()=>({enabled:true,records:rows.length,copiedBytes:budget,maxBytes,truncated,scope:'exact captured CPU view bytes only; returned calls do not prove GL acceptance; unpack/sampler unobserved state and GPU conversion remain unknown'}),dispose(){disposed=true;for(const f of restore.reverse())f();bindings.clear()}};
}
/** Install before the owned engine constructor obtains its GL context. */
export function installOwnedCanvasUploadProvenance(canvas,options={}){
  if(!options.enabled)return{capture:null,dispose(){}};
  const original=canvas.getContext;let capture=null;
  const wrapped=function(...args){const result=original.apply(this,args);if(result&&!capture&&['webgl','experimental-webgl'].includes(args[0]))capture=installUploadProvenance(result,{...options,freshOwnedCanvas:options.freshOwnedCanvas===true});return result};
  canvas.getContext=wrapped;
  return{get capture(){return capture},dispose(){if(canvas.getContext===wrapped)canvas.getContext=original;capture?.dispose()}};
}

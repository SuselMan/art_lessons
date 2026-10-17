// External opt-in QA observer; shared harness wiring is deliberately separate.
// Select exactly ONE plane: seed, outward ordinal1..N, inward ordinal1..N, band.
module.exports=()=>{globalThis.__qa748FrontBoundaryProbe=(plan,passes,getRect,options={})=>{
 const kind=options.kind||'outward',ordinal=options.ordinal??1,maxBytes=options.maxBytes??16*1024*1024;
 if(!['seed','outward','inward','band'].includes(kind)||!Number.isSafeInteger(ordinal)||ordinal<1||!Number.isSafeInteger(maxBytes)||maxBytes<4)throw Error('Invalid front boundary selection');
 const original={fieldFor:plan.ctx.fieldFor,fieldOp:passes.fieldOp,front:passes.waterFrontStep},events=[],restoration={};let current,selected,phase,group=0,outward=0,inward=0,plane,capture,restored=false,peakRetainedBytes=0;
 const read=(name,buffer)=>{if(plane)throw Error('Duplicate selected front capture');const bytes=buffer.width*buffer.height*4;if(bytes>maxBytes)throw Error('Selected front plane exceeds explicit CPU cap');const pixels=buffer.readPixels();if(!(pixels instanceof Uint8Array)||pixels.byteLength!==bytes)throw Error('Invalid selected front plane');plane=pixels;peakRetainedBytes=bytes;capture={name,width:buffer.width,height:buffer.height,bytes,filter:buffer._baseFilter,pointSampling:buffer._pointSampling}};
 const fieldFor=function(...args){const field=original.fieldFor.apply(this,args);current={field,args:args.slice(),rect:{...getRect()}};return field};
 const fieldOp=function(...args){const[out,a,b,mode,k]=args,f=current?.field;
  // First real front seed only; physical solvent combine cannot match field.pressure/mode10.
  if(!selected&&f&&mode===10&&out===f.pressure){selected=current;phase='outward';group=1;events.push({method:'fieldOp',mode,k,role:'seed'})}
  const result=original.fieldOp.apply(this,args);
  if(selected===current&&f){
   if(mode===10&&out===f.pressure){if(events.length>1||phase!=='outward')group++;if(group===1&&kind==='seed')read('seed',out)}
   if(group===1&&mode===12&&out===f.mask){phase='inward';events.push({method:'fieldOp',mode,k,role:'inward-seed'})}
   if(group===1&&mode===6&&out===f.band){events.push({method:'fieldOp',mode,k,role:'band'});if(kind==='band')read('band',out);phase='done'}
  }return result
 };
 const front=function(...args){const result=original.front.apply(this,args);if(selected===current&&args[0]===selected.field&&group===1&&(phase==='outward'||phase==='inward')){const n=phase==='outward'?++outward:++inward;events.push({method:'waterFrontStep',phase,ordinal:n,x0:args[1],y0:args[2],dryCost:args[3],max:args[6],climb:args[7],floor:args[8],stride:args[9]??1,scale:args[10]??1,foreign:!!args[11],discreteGrid:args[12]===true});if(kind===phase&&n===ordinal)read(phase+':'+n,args[5])}return result};
 plan.ctx.fieldFor=fieldFor;passes.fieldOp=fieldOp;passes.waterFrontStep=front;
 const restore=()=>{if(restored)return;restored=true;restoration.ownershipExact=plan.ctx.fieldFor===fieldFor&&passes.fieldOp===fieldOp&&passes.waterFrontStep===front;plan.ctx.fieldFor=original.fieldFor;passes.fieldOp=original.fieldOp;passes.waterFrontStep=original.front;restoration.restored=true};
 return{restore,discard(){restore();plane=undefined},async finish(){if(!plane)throw Error('Selected front boundary not observed');const bytes=plane;try{const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''),gzip=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());let binary='';for(let i=0;i<gzip.length;i+=8192)binary+=String.fromCharCode(...gzip.subarray(i,i+8192));return{summary:{selection:{kind,ordinal,maxBytes},capture:{...capture,sha256},outward,inward,events,fieldArgs:selected.args,rect:selected.rect,peakRetainedBytes,restoration,qualification:'One selected first-front plane, CPU raw retention cap; gzip staging additional; no draws/sampler/ops changes, no performance claim'},arrays:{[capture.name]:{...capture,sha256,gzipBase64:btoa(binary)}}}}finally{plane=undefined}}}
 }}

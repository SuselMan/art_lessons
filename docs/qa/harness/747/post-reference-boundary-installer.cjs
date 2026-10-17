// QA-only observer. Installs no app changes, draws, sampler changes, or op wrappers.
module.exports=()=>{globalThis.__qa748PostReferenceProbe=(plan,passes,getRect,selectedWindow)=>{
 const fieldFor=plan.ctx.fieldFor,fieldOp=passes.fieldOp,arrays={},captures={},events=[],restoration={};let current,selected,restored=false,started=false;
 const read=(name,buffer)=>{if(arrays[name])throw Error('Duplicate post-reference stage '+name);const pixels=buffer.readPixels();if(pixels.byteLength!==buffer.width*buffer.height*4)throw Error('Invalid post-reference plane '+name);arrays[name]=pixels;captures[name]={width:buffer.width,height:buffer.height,bytes:pixels.byteLength,pointSampling:buffer._pointSampling,baseFilter:buffer._baseFilter};events.push(name)};
 const wrappedFieldFor=function(...args){if(args.some(v=>v!==undefined&&typeof v!=='number'&&typeof v!=='boolean'&&typeof v!=='string')||args.some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Non-scalar fieldFor metadata');if(selected&&events.length!==9)throw Error('Field changed during initial split capture');const field=fieldFor.apply(this,args);current={field,args:[...args],rect:{...getRect()}};return field};
 const wrappedFieldOp=function(...args){const[out,a,b,mode,k]=args,field=current?.field;
  if(!started&&field&&mode===0&&out===field.c&&a===field.a&&b===field.b&&(selectedWindow===undefined||current.rect.x===selectedWindow)){
   selected=current;started=true;
   for(const[name,buffer]of [['inputP',field.a],['referenceP',field.b],['inputC',field.ca],['referenceC',field.cb],['coverage',field.coverage]])read(name,buffer);
  }
  const result=fieldOp.apply(this,args);
  if(selected&&current===selected){const f=selected.field;
   if(mode===0&&out===f.c&&a===f.a&&b===f.b&&!arrays.mobileP){read('mobileP',out);selected.mobileShare=k}
   else if(mode===1&&out===f.b&&a===f.a&&b===f.c&&k===-1&&!arrays.fixedP)read('fixedP',out);
   else if(mode===0&&out===f.cc&&a===f.ca&&b===f.cb&&!arrays.mobileC)read('mobileC',out);
   else if(mode===1&&out===f.cb&&a===f.ca&&b===f.cc&&k===-1&&!arrays.fixedC)read('fixedC',out);
  }
  return result
 };
 plan.ctx.fieldFor=wrappedFieldFor;passes.fieldOp=wrappedFieldOp;
 return{restore(){if(restored)return;restored=true;const mismatch=plan.ctx.fieldFor!==wrappedFieldFor||passes.fieldOp!==wrappedFieldOp;plan.ctx.fieldFor=fieldFor;passes.fieldOp=fieldOp;restoration.restored=true;restoration.ownershipExact=!mismatch},async finish(){
  const names=['inputP','referenceP','inputC','referenceC','coverage','mobileP','fixedP','mobileC','fixedC'];if(!selected||names.some(name=>!arrays[name]))throw Error('Incomplete post-reference capture '+events.join(','));
  const output={};for(const name of names){const bytes=arrays[name],sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''),gzip=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());let binary='';for(let i=0;i<gzip.length;i+=8192)binary+=String.fromCharCode(...gzip.subarray(i,i+8192));captures[name].sha256=sha256;output[name]={...captures[name],gzipBase64:btoa(binary)};delete arrays[name]}
  return{summary:{restoration,qualification:'QA readback observer; no performance claim',rect:selected.rect,fieldArgs:selected.args,mobileShare:selected.mobileShare,events,captures},arrays:output}
 }}
}}

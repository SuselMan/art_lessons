// Installs only in one owned QA page; never changes shaders, uniforms or blend.
// Readback deliberately stalls draws: correctness localization, not a timing probe.
module.exports=function installDepositionProbe({limit=32,captureCall=null}={}){
 const e=window.__engine,g=e.gl,passes=e._ribbonPasses;
 if(!passes)throw Error('Ribbon passes unavailable');
 const probe=window.__qaDeposition={calls:[],programs:[],pending:[],totalDraws:0,limit,captured:null};
 const sha=bytes=>crypto.subtle.digest('SHA-256',bytes).then(b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join(''));
 const plain=value=>ArrayBuffer.isView(value)?Array.from(value):value;
 const defer=(record,key,bytes)=>probe.pending.push(sha(bytes).then(hash=>{record[key]=hash}));
 const programs=new Map();let active=null;
 const raw=()=>{const pixels=new Uint8Array(active.dest.width*active.dest.height*4);g.readPixels(0,0,active.dest.width,active.dest.height,g.RGBA,g.UNSIGNED_BYTE,pixels);return pixels};
 const fields=['BLEND','BLEND_SRC_RGB','BLEND_DST_RGB','BLEND_SRC_ALPHA','BLEND_DST_ALPHA','BLEND_EQUATION_RGB','BLEND_EQUATION_ALPHA','BLEND_COLOR','COLOR_WRITEMASK','VIEWPORT','SCISSOR_TEST','SCISSOR_BOX','DITHER','SAMPLE_COVERAGE','SAMPLE_ALPHA_TO_COVERAGE','SUBPIXEL_BITS'];
 const state=()=>Object.fromEntries(fields.map(name=>[name,plain(g.getParameter(g[name]))]));
 const programInfo=program=>{
  if(programs.has(program))return programs.get(program);
  const record={id:programs.size,shaders:[]};programs.set(program,record);probe.programs.push(record);
  for(const shader of g.getAttachedShaders(program)||[]){const source=g.getShaderSource(shader)||'',item={type:g.getShaderParameter(shader,g.SHADER_TYPE),length:source.length};defer(item,'sha',new TextEncoder().encode(source));record.shaders.push(item)}
  return record;
 };
 const uniforms=program=>{const result={};for(let i=0;i<g.getProgramParameter(program,g.ACTIVE_UNIFORMS);i++){const item=g.getActiveUniform(program,i);result[item.name]=plain(g.getUniform(program,g.getUniformLocation(program,item.name)))}return result};
 const passArgs=(kind,args)=>{
  if(kind==='nib')return JSON.parse(JSON.stringify({dab:args[2],preset:args[3],profile:args[4],mode:args[5],opacity:args[6],ownTarget:args[7],inkWater:args[8],acrossLocal:args[9],paperWet:args[10],inkStrength:args[11],mottleSeed:args[12],clipTo:!!args[13],bristleCombs:args[14],bristleInk:args[15],depthTau:args[16],puddle:args[17],poolBlot:args[18]}));
  const bands=args[2];const result={bandFloatCount:bands.length,mode:args[3],aaPx:args[4],cloud:args[5],gran:args[6],mottleSeed:args[7],washWater:args[8],waterRetain:args[9],bristleCombs:args[10],bristleInk:args[11],depthTau:args[12],poolBlot:args[13],availableWater:!!args[14]};defer(result,'bandBytesSHA',new Uint8Array(bands.buffer,bands.byteOffset,bands.byteLength));return result;
 };
 for(const [name,kind]of [['drawRibbonNibPass','nib'],['drawRibbonBands','bands']]){
  const original=passes[name];passes[name]=function(...args){const previous=active;active={kind,dest:args[0],tile:args[1],args:passArgs(kind,args)};try{return original.apply(this,args)}finally{active=previous}};
 }
 const draw=g.drawArrays;
 g.drawArrays=function(...args){
  if(!active)return Reflect.apply(draw,this,args);
  const index=probe.totalDraws++;if(index>=limit&&index!==captureCall)return Reflect.apply(draw,this,args);
  const program=g.getParameter(g.CURRENT_PROGRAM),info=programInfo(program);
  const record={index,kind:active.kind,dest:{width:active.dest.width,height:active.dest.height},tile:{x:active.tile.originX,y:active.tile.originY},args:active.args,draw:args,program:info.id,uniforms:uniforms(program),state:state(),glBefore:g.getError()};
  // FBO is the actual draw target here; no bind/mutation is needed.
  const before=raw();defer(record,'beforeSHA',before);
  Reflect.apply(draw,this,args);
  const after=raw();defer(record,'afterSHA',after);record.glAfter=g.getError();
  let changed=0,nonzero=0;const sums=[0,0,0,0];for(let i=0;i<after.length;i++){if(before[i]!==after[i])changed++;if(after[i])nonzero++;sums[i%4]+=after[i]}Object.assign(record,{changed,nonzero,sums});
  if(index===captureCall){let encoded='';for(let i=0;i<after.length;i+=8192)encoded+=String.fromCharCode(...after.subarray(i,i+8192));probe.captured={index,width:active.dest.width,height:active.dest.height,base64:btoa(encoded)}}
  probe.calls.push(record);
 };
 const precision={};for(const stage of ['VERTEX_SHADER','FRAGMENT_SHADER'])for(const level of ['HIGH_FLOAT','MEDIUM_FLOAT','LOW_FLOAT']){const value=g.getShaderPrecisionFormat(g[stage],g[level]);precision[stage+':'+level]=value?{precision:value.precision,min:value.rangeMin,max:value.rangeMax}:null}
 probe.identity={version:g.getParameter(g.VERSION),shadingLanguage:g.getParameter(g.SHADING_LANGUAGE_VERSION),precision,specializedWatercolorNib:passes.specializedWatercolorNib};
};

(async function(input) {
 const e=window.__stageEngine;if(!e||!window.__maskSolverSession)throw Error('Actual full-journal engine required');
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');
 const {WatercolorPasses}=await import('/src/engine/src/raster/WatercolorPasses.ts');
 const {WatercolorPasses:OldPasses}=await import(input.oldPassesURL);
 const shaders=await import('/src/engine/src/raster/shaders.ts');
 const oldShaders=await import(input.oldShadersURL);
 if(shaders.WC_FIELD_OP_CARRY_FRAG!==oldShaders.WC_FIELD_OP_CARRY_FRAG||shaders.WC_FIELD_OP_CARRY_COLOUR_FRAG!==oldShaders.WC_FIELD_OP_CARRY_COLOUR_FRAG)throw Error('Original program strings changed');
 const gl=e.gl,p=e._watercolorPasses,ids=new Map(),base=new Map(),commands=[],restore=[],raw=new Map();
 const state={source:input.source,collecting:false,complete:false,field:null,lastP:null,mobileC:null,inputs:{},maxBytes:256*1024*1024,allocated:0,commands};
 const saveState=()=>({active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),fbo:gl.getParameter(gl.FRAMEBUFFER_BINDING)});
 const restoreState=s=>{gl.activeTexture(s.active);gl.bindTexture(gl.TEXTURE_2D,s.texture);gl.bindFramebuffer(gl.FRAMEBUFFER,s.fbo)};
 function clone(b){if(!['linear','nearest'].includes(b._baseFilter))throw Error('Unknown actual sampler filter');const s=saveState();try{const bytes=b.width*b.height*4;state.allocated+=bytes;if(state.allocated>state.maxBytes)throw Error('Checkpoint allocation cap');const c=new AccumulationBuffer(gl,b.width,b.height,b._baseFilter);b.copyTo(c);return c}finally{restoreState(s)}}
 function id(b){if(!b)return null;if(!ids.has(b)){const key=ids.size+1;ids.set(b,key);base.set(key,clone(b));}return ids.get(b)}
 const opts=o=>Object.fromEntries(Object.entries(o??{}).map(([k,v])=>[k,['c','d','e','path'].includes(k)?{buffer:id(v)}:Array.isArray(v)?[...v]:v]));
 function wrap(obj,key,make){const fn=obj[key];if(typeof fn!=='function')throw Error('Missing actual seam '+key);obj[key]=make(fn);restore.push(()=>obj[key]=fn)}
 wrap(p,'waterFrontStep',f=>function(...a){if(!state.field)state.field=a[0];return f.apply(this,a)});
 wrap(p,'fieldOp',f=>function(...a){
  if(state.field&&a[0].width===state.field.w&&a[0].height===state.field.h&&!state.complete){
   if(a[3]===15&&!state.collecting){state.collecting=true;state.inputs={P:id(a[1]),fixedP:id(a[2]),cost:id(a[5]?.d),V:id(a[5]?.e),coverage:id(state.field.coverage),...(base.has('Ctotal')?{Ctotal:'Ctotal'}:{})};}
   if(state.collecting){commands.push({kind:'field',out:id(a[0]),a:id(a[1]),b:id(a[2]),mode:a[3],k:a[4],opts:opts(a[5])});if(a[3]===15)state.lastP=ids.get(a[0]);if(a[3]===16)state.mobileC=ids.get(a[0]);}
  }
  return f.apply(this,a);
 });
 wrap(p,'costDomainStep',f=>function(...a){if(state.field&&!state.collecting&&!base.has('Ctotal'))base.set('Ctotal',clone(state.field.ca));if(state.collecting&&!state.complete)commands.push({kind:'mask',out:id(a[0]),source:id(a[1]),rect:[...a[2]],band:a[3],stride:a[4]});return f.apply(this,a)});
 wrap(p,'diffuseStep',f=>function(...a){if(state.collecting&&!state.complete&&a[0]===state.field)state.complete=true;return f.apply(this,a)});
 const shaderNames=['WC_FIELD_OP_CARRY_FRAG','WC_FIELD_OP_CARRY_COLOUR_FRAG','WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG','WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_COLOUR_FRAG'];
 function cold(){const rows=[];for(let salt=0;salt<3;salt++)for(const name of shaderNames){const compile=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text+`\n// zero-face-${input.nonce}-${salt}-${name}\n`);gl.compileShader(s);return s};const v=compile(gl.VERTEX_SHADER,shaders.DISPLAY_VERT),f=compile(gl.FRAGMENT_SHADER,shaders[name]),program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);const row={name,salt,v:gl.getShaderParameter(v,gl.COMPILE_STATUS),f:gl.getShaderParameter(f,gl.COMPILE_STATUS),link:gl.getProgramParameter(program,gl.LINK_STATUS),log:gl.getProgramInfoLog(program),fragmentLog:gl.getShaderInfoLog(f)};rows.push(row);gl.deleteProgram(program);gl.deleteShader(v);gl.deleteShader(f);if(!row.v||!row.f||!row.link)throw Error('Salted Adreno compile '+name)}return rows}
 function sample(b){const s=saveState();try{const bytes=new Uint8Array(b.width*b.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);const sum=[0,0,0,0],maximum=[0,0,0,0];let alpha=0;for(let n=0;n<bytes.length;n+=4){if(bytes[n+3])alpha++;for(let k=0;k<4;k++){sum[k]+=bytes[n+k];maximum[k]=Math.max(maximum[k],bytes[n+k])}}return {sha:input.sha(bytes),sum,maximum,alphaNonzero:alpha,bytes}}finally{restoreState(s)}}
 const b64=bytes=>{let text='';for(let n=0;n<bytes.length;n+=8192)text+=String.fromCharCode(...bytes.subarray(n,n+8192));return btoa(text)};
 const get=key=>{const b=base.get(key);if(!b)throw Error('Missing full checkpoint '+key);return b};
 async function arm(name){
  if(!state.complete)throw Error('Actual pre-diffuse checkpoint absent');const count=commands.filter(c=>c.kind==='field'&&c.mode===15).length;if(count!==14)throw Error('Actual carry count '+count);
  const copies=new Map(),owned=[];let passes,screen;const before=state.allocated;
  try{
   for(const [key,b]of base){const c=clone(b);copies.set(key,c);owned.push(c)}
   screen=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,screen);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   passes=new(name==='OLD'?OldPasses:WatercolorPasses)({gl:()=>gl,screenBuf:()=>screen});passes.initFieldPrograms();passes.initSettlePrograms();passes.initFieldUniforms();passes.initFieldAttributes();passes.initDiffusionAttributes();
   const initialHashes=Object.fromEntries([...copies].map(([key,b])=>{const x=sample(b);return[key,x.sha]}));
   const stages=[];for(const c of commands){if(c.kind==='mask')passes.costDomainStep(copies.get(c.out),copies.get(c.source),c.rect,c.band,c.stride);else{const options=Object.fromEntries(Object.entries(c.opts).map(([k,v])=>[k,v&&typeof v==='object'&&!Array.isArray(v)&&'buffer'in v?(v.buffer===null?undefined:copies.get(v.buffer)):v]));options.independentZeroFaces=false;options.additiveZeroFaces=name==='ADD';passes.fieldOp(copies.get(c.out),copies.get(c.a),copies.get(c.b),c.mode,c.k,options)}}
   const records={};for(const [label,key]of Object.entries({...state.inputs,P:state.lastP,...(state.mobileC?{C:state.mobileC}:{})})){const x=sample(copies.get(key));const rawKey=name+'-'+label;raw.set(rawKey,x.bytes);delete x.bytes;records[label]={...x,width:get(key).width,height:get(key).height,rawKey};}
   const error=gl.getError();if(error||gl.isContextLost())throw Error('Actual GL failure '+error);return {name,initialHashes,records,carryCount:count,colourCarryCount:commands.filter(c=>c.kind==='field'&&c.mode===16).length,gl:error,lost:gl.isContextLost(),scope:'full checkpoint carry only; no diffuse/tide/composite endpoint',stages};
  }finally{passes?.destroy();for(const b of owned)b.destroy();if(screen)gl.deleteBuffer(screen);state.allocated=before}
 }
 window.__zeroCheckpoint={state,raw,cold,arm,inputKeys:()=>[...base.keys()],inputRecord(key){const b=get(key),x=sample(b),rawKey='INPUT-'+key;raw.set(rawKey,x.bytes);delete x.bytes;return {...x,width:b.width,height:b.height,filter:b._baseFilter,rawKey}},inputHashes(){return Object.fromEntries([...base].map(([key,b])=>{const x=sample(b);delete x.bytes;return[key,x]}))},chunk:(key,offset,size)=>{const b=raw.get(key);if(!b)throw Error('Missing raw');return b64(b.subarray(offset,offset+size))},releaseRaw(key){raw.delete(key)},detach(){for(const f of restore.reverse())f();restore.length=0},dispose(){this.detach();for(const b of base.values())b.destroy();base.clear();raw.clear();delete window.__zeroCheckpoint}};
 return {ready:true,fullJournalRequired:true,coldProgramCount:12};
})

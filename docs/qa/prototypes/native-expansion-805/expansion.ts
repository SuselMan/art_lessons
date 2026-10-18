import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
/** QA front shader and immutable-water predicate cache. Other stage
 * experiments are applied by source.cjs. Exact variants require device proofs. */
const KEY='__qaNativeExpansion805'
export function expansionRadius805(value=24){if(!Number.isInteger(value)||value<1||value>96)throw Error('Expansion radius must be integer1..96');return value}
export function expansionNoise805(size=128,seed=805){
 if(!Number.isSafeInteger(size)||size<8||size>512)throw Error('Invalid expansion noise size')
 const hash=(x:number,y:number)=>{let n=(Math.imul(x+17,374761393)^Math.imul(y+31,668265263)^seed)>>>0;n=Math.imul(n^(n>>>13),1274126177)>>>0;return(n^(n>>>16))&255}
 const sample=(x:number,y:number,cell:number)=>{const ix=Math.floor(x/cell),iy=Math.floor(y/cell),fx=Math.floor((x%cell)*256/cell),fy=Math.floor((y%cell)*256/cell);const a=hash(ix,iy)*(256-fx)+hash(ix+1,iy)*fx,b=hash(ix,iy+1)*(256-fx)+hash(ix+1,iy+1)*fx;return Math.floor((a*(256-fy)+b*fy)/65536)}
 const rgba=new Uint8Array(size*size*4)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const value=Math.floor((3*sample(x,y,16)+sample(x,y,7))/4),at=(y*size+x)*4;rgba[at]=rgba[at+1]=rgba[at+2]=value;rgba[at+3]=255}
 return rgba
}
export const EXPANSION_FRONT_FRAG_805=`precision highp float;
varying vec2 uv;uniform sampler2D cost,waterA,waterB,noiseMap;uniform vec2 resolution;
uniform float maximum,budget,radius,outward,noisy,stride;
float wet(vec2 p){if(min(min(p.x,p.y),min(1.-p.x,1.-p.y))<0.)return 0.;return step(.000001,texture2D(waterA,p).a+texture2D(waterB,p).a);}
vec2 direction(int k){if(k==0)return vec2(1.,0.);if(k==1)return vec2(-1.,0.);if(k==2)return vec2(0.,1.);if(k==3)return vec2(0.,-1.);if(k==4)return vec2(1.,1.);if(k==5)return vec2(-1.,1.);if(k==6)return vec2(1.,-1.);return vec2(-1.,-1.);}
void main(){vec4 own=texture2D(cost,uv);float n=texture2D(noiseMap,uv).r;float height=mix(.5,.25+.5*n,noisy);
if(wet(uv)<.5){gl_FragColor=vec4(outward>.5?1.:own.r,height,own.b,1.);return;}
float best=own.r*maximum;float stepCost=outward>.5?budget/radius*(1.+noisy*.7*n):1.;
for(int k=0;k<8;k++){vec2 d=direction(k)*stride,p=uv+d/resolution;
if(outward>.5&&stride>1.5&&wet(uv+d*.5/resolution)<.5)continue;
if(min(min(p.x,p.y),min(1.-p.x,1.-p.y))<0.)continue;
if(abs(d.x)>.5&&abs(d.y)>.5){if(outward>.5&&stride>1.5&&(wet(uv+vec2(d.x*.5,0.)/resolution)<.5||wet(uv+vec2(0.,d.y*.5)/resolution)<.5))continue;if(wet(uv+vec2(d.x,0.)/resolution)<.5||wet(uv+vec2(0.,d.y)/resolution)<.5)continue;}
if(outward>.5&&wet(p)<.5)continue;float previous=texture2D(cost,p).r;
if(previous<.999)best=min(best,previous*maximum+length(d)*stepCost);}
gl_FragColor=vec4(min(best,maximum)/maximum,height,own.b,1.);}`

const BASE_FRONT_FRAG_805=`precision highp float;
varying vec2 uv;uniform sampler2D cost,waterA,waterB,noiseMap;uniform vec2 resolution;
uniform float maximum,budget,radius,outward,noisy;
float wet(vec2 p){if(min(min(p.x,p.y),min(1.-p.x,1.-p.y))<0.)return 0.;return step(.000001,texture2D(waterA,p).a+texture2D(waterB,p).a);}
vec2 direction(int k){if(k==0)return vec2(1.,0.);if(k==1)return vec2(-1.,0.);if(k==2)return vec2(0.,1.);if(k==3)return vec2(0.,-1.);if(k==4)return vec2(1.,1.);if(k==5)return vec2(-1.,1.);if(k==6)return vec2(1.,-1.);return vec2(-1.,-1.);}
void main(){vec4 own=texture2D(cost,uv);float n=texture2D(noiseMap,uv).r;float height=mix(.5,.25+.5*n,noisy);
if(wet(uv)<.5){gl_FragColor=vec4(outward>.5?1.:own.r,height,own.b,1.);return;}
float best=own.r*maximum;float stepCost=outward>.5?budget/radius*(1.+noisy*.7*n):1.;
for(int k=0;k<8;k++){vec2 d=direction(k),p=uv+d/resolution;
if(min(min(p.x,p.y),min(1.-p.x,1.-p.y))<0.)continue;
if(abs(d.x)+abs(d.y)>1.5){if(wet(uv+vec2(d.x,0.)/resolution)<.5||wet(uv+vec2(0.,d.y)/resolution)<.5)continue;}
if(outward>.5&&wet(p)<.5)continue;float previous=texture2D(cost,p).r;
if(previous<.999)best=min(best,previous*maximum+length(d)*stepCost);}
gl_FragColor=vec4(min(best,maximum)/maximum,height,own.b,1.);}`
function program805(gl:WebGLRenderingContext,stepTwo:number|boolean=false,precombined=false,fragmentOverride?:string){
 const shader=(type:number,source:string)=>{const s=gl.createShader(type);if(!s)throw Error('Expansion shader allocation');gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error('Expansion shader compile '+message)}return s}
 const vs=shader(gl.VERTEX_SHADER,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}')
 let fs:WebGLShader|null=null,p:WebGLProgram|null=null
 try{const fragment=fragmentOverride??(stepTwo?EXPANSION_FRONT_FRAG_805.replace('uniform float maximum,budget,radius,outward,noisy,stride;','uniform float maximum,budget,radius,outward,noisy;const float stride='+Number(stepTwo===true?2:stepTwo)+'.;'):BASE_FRONT_FRAG_805);fs=shader(gl.FRAGMENT_SHADER,precombined?fragment.replace('step(.000001,texture2D(waterA,p).a+texture2D(waterB,p).a)','texture2D(waterA,p).a'):fragment);p=gl.createProgram();if(!p)throw Error('Expansion program allocation');gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Expansion program link '+gl.getProgramInfoLog(p));return p}catch(error){if(p)gl.deleteProgram(p);throw error}finally{gl.deleteShader(vs);if(fs)gl.deleteShader(fs)}
}

export function installNativeExpansion805(engine:any,controller:any|null,options:{noise:boolean;allWetMobile?:boolean;radiusPx?:number;precombineWater?:boolean}){
 const gl=engine.gl as WebGLRenderingContext,passes=engine._watercolorPasses,radiusPx=expansionRadius805(options.radiusPx)
 if(typeof options.noise!=='boolean'||(options.allWetMobile!==undefined&&typeof options.allWetMobile!=='boolean'))throw Error('Expansion requires valid explicit noise and optional allWetMobile policy')
 const target=globalThis as unknown as Record<string,unknown>
 if(target[KEY]!==undefined)throw Error('Expansion already active')
 if(controller!==null&&(typeof controller.diagnosticRunCore!=='function'||typeof controller.diagnosticSource!=='function'))throw Error('Expansion requires diagnostic controller or null for explicit source scopes')
 const originalFront=passes.waterFrontStep,originalCore=controller?.diagnosticRunCore,token={noise:options.noise,allWetMobile:options.allWetMobile??false,radiusPx}
 let stepFourProgram:WebGLProgram|null=null;let stepFourUniforms:Record<string,WebGLUniformLocation|null>|null=null;let stepFourPosition=0
 const maskFragment='precision highp float;varying vec2 uv;uniform sampler2D waterA,waterB;void main(){float wet=step(.000001,texture2D(waterA,uv).a+texture2D(waterB,uv).a);gl_FragColor=vec4(wet);}'
 const maskProgram=options.precombineWater?program805(gl,false,false,maskFragment):null
 let waterMask:AccumulationBuffer|null=null,maskValid=false
 const program=program805(gl,false,options.precombineWater),stepTwoProgram=program805(gl,true,options.precombineWater),quad=gl.createBuffer(),noise=gl.createTexture(),zero=gl.createTexture()
 if(!quad||!noise||!zero){if(quad)gl.deleteBuffer(quad);if(noise)gl.deleteTexture(noise);if(zero)gl.deleteTexture(zero);gl.deleteProgram(program);gl.deleteProgram(stepTwoProgram);waterMask?.destroy();if(maskProgram)gl.deleteProgram(maskProgram);if(stepFourProgram)gl.deleteProgram(stepFourProgram);throw Error('Expansion resources allocation')}
 const locations=(p:WebGLProgram)=>Object.fromEntries(['cost','waterA','waterB','noiseMap','resolution','maximum','budget','radius','outward','noisy','stride'].map(name=>[name,gl.getUniformLocation(p,name)]));const baseUniforms=locations(program),stepTwoUniforms=locations(stepTwoProgram),position=gl.getAttribLocation(program,'pos'),stepTwoPosition=gl.getAttribLocation(stepTwoProgram,'pos')
 let active:{waterA:WebGLTexture|null;waterB:WebGLTexture|null;width:number;height:number}|null=null,restored=false
 const stats={frontDraws:0,outwardDraws:0,inwardDraws:0,coreCalls:0,sourceScopes:0,waterMaskDraws:0}
 /** Synchronous target-method scope. No source reference or global policy survives
  * the callback, so a later frame/stroke must supply its own immutable source. */
 const withSource=<T>(source:{entry:any},work:()=>T):T=>{
  if(restored)throw Error('Expansion installer already restored')
  if(active||target[KEY]!==undefined)throw Error('Expansion nested source scope')
  const entry=source?.entry
  if(!entry?.inkLoad||(!entry.solventLoad&&!entry.foreignSolventLoad))throw Error('Expansion missing immutable initial water/source')
  const width=entry.inkLoad.width,height=entry.inkLoad.height
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw Error('Expansion invalid source dimensions')
  const descriptor=Object.getOwnPropertyDescriptor(target,KEY)
  active={waterA:entry.solventLoad?.texture??null,waterB:entry.foreignSolventLoad?.texture??null,width,height}
  try{
  if(maskProgram){
   if(!waterMask||waterMask.width!==width||waterMask.height!==height){waterMask?.destroy();waterMask=new AccumulationBuffer(gl,width,height,'nearest');maskValid=false}
   if(!maskValid){waterMask.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.useProgram(maskProgram);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const position=gl.getAttribLocation(maskProgram,'pos');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);for(const[i,name,t]of [[0,'waterA',active.waterA??zero],[1,'waterB',active.waterB??zero]]as const){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(maskProgram,name),i)}gl.drawArrays(gl.TRIANGLES,0,6);waterMask.endDraw();gl.activeTexture(gl.TEXTURE0);maskValid=true;stats.waterMaskDraws++}
   active={...active,waterA:waterMask.texture,waterB:null}
  }

   Object.defineProperty(target,KEY,{configurable:true,writable:true,value:token});stats.sourceScopes++
   const result=work()
   if(result!==null&&(typeof result==='object'||typeof result==='function')&&typeof (result as {then?:unknown}).then==='function')throw Error('Expansion source scope must be synchronous')
   return result
  }finally{active=null;if(descriptor)Object.defineProperty(target,KEY,descriptor);else delete target[KEY]}
 }
 const texture=(t:WebGLTexture,size:number,bytes:Uint8Array)=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes)}
 try{
  gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);texture(noise,128,expansionNoise805());texture(zero,1,new Uint8Array(4))
  passes.waterFrontStep=function(field:any,x0:number,y0:number,_dryCost:number,src:any,dst:any,maximum:number,climb:number,_floor:number,stride=1,scale=1){
   if(!active||target[KEY]!==token)return originalFront.apply(this,arguments)
   if(scale!==1||x0!==0||y0!==0||field.w!==active.width||field.h!==active.height||src.width!==field.w||dst.width!==field.w||![1,2,4].includes(stride))throw Error('Expansion only supports complete S1 unit-step Mini field')
   dst.beginReplaceDraw()
   try{
    gl.disable(gl.SCISSOR_TEST);if(stride===4&&!stepFourProgram){stepFourProgram=program805(gl,4,options.precombineWater);stepFourUniforms=locations(stepFourProgram);stepFourPosition=gl.getAttribLocation(stepFourProgram,'pos')}const activeProgram=stride===4?stepFourProgram!:stride===2?stepTwoProgram:program,uniforms=stride===4?stepFourUniforms!:stride===2?stepTwoUniforms:baseUniforms,activePosition=stride===4?stepFourPosition:stride===2?stepTwoPosition:position;gl.useProgram(activeProgram);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(activePosition);gl.vertexAttribPointer(activePosition,2,gl.FLOAT,false,0,0)
    for(const [i,name,t]of [[0,'cost',src.texture],[1,'waterA',active.waterA??zero],[2,'waterB',active.waterB??zero],[3,'noiseMap',noise]]as const){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(uniforms[name],i)}
    const outward=climb>=29.5;gl.uniform2f(uniforms.resolution,field.w,field.h);gl.uniform1f(uniforms.maximum,maximum);gl.uniform1f(uniforms.budget,Math.max(1,maximum-4));gl.uniform1f(uniforms.radius,radiusPx);gl.uniform1f(uniforms.outward,outward?1:0);gl.uniform1f(uniforms.noisy,options.noise?1:0);gl.uniform1f(uniforms.stride,stride);gl.drawArrays(gl.TRIANGLES,0,6)
    stats.frontDraws++;if(outward)stats.outwardDraws++;else stats.inwardDraws++
   }finally{try{dst.endDraw()}finally{gl.activeTexture(gl.TEXTURE0)}}
  }
  if(controller!==null)controller.diagnosticRunCore=function(...args:unknown[]){return withSource(controller.diagnosticSource(),()=>{stats.coreCalls++;return originalCore.apply(this,args)})}
 }catch(error){passes.waterFrontStep=originalFront;if(controller!==null)controller.diagnosticRunCore=originalCore;gl.deleteBuffer(quad);gl.deleteTexture(noise);gl.deleteTexture(zero);gl.deleteProgram(program);gl.deleteProgram(stepTwoProgram);waterMask?.destroy();if(maskProgram)gl.deleteProgram(maskProgram);if(stepFourProgram)gl.deleteProgram(stepFourProgram);throw error}
 return{withSource,invalidateWater(){maskValid=false},stats,metadata:{id:options.noise?'noisy-expansion':'smooth-expansion',radiusPx,allWetMobile:token.allWetMobile,selection:token.allWetMobile?'Explicit historical all-wet-mobile hypothesis':'Original native contrast/Q selection and reference',fixedInitialWater:true,precombinedWater:options.precombineWater===true,front:'Fixed source water; 8-neighbor schedule selected by compiled profile',noise:'seed805, CPU integer lattice128², costfactor1..1.7; flat variant factor1',qualification:options.precombineWater?'Materialized binary wet predicate; exactness must be verified against the corresponding non-cache profile.':'QA native-stage prototype; consult the compiled profile for schedule changes. No standalone cross-GPU certification.'},restore(){if(restored)return;if(active)throw Error('Cannot restore active expansion');restored=true;passes.waterFrontStep=originalFront;if(controller!==null)controller.diagnosticRunCore=originalCore;if([program,stepTwoProgram,stepFourProgram].includes(gl.getParameter(gl.CURRENT_PROGRAM)))gl.useProgram(null);gl.deleteBuffer(quad);gl.deleteTexture(noise);gl.deleteTexture(zero);gl.deleteProgram(program);gl.deleteProgram(stepTwoProgram);waterMask?.destroy();if(maskProgram)gl.deleteProgram(maskProgram);if(stepFourProgram)gl.deleteProgram(stepFourProgram)}}
}

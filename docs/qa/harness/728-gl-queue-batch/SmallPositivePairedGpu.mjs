export const SMALL_POSITIVE_BYTES=128*128*16*5;
export const SMALL_POSITIVE_FRAGMENT=`precision highp float;
uniform sampler2D oldMoment;uniform sampler2D donor;uniform float hop;varying vec2 uv;
bool inside(vec2 p){return p.x>=0.0&&p.y>=0.0&&p.x<1.0&&p.y<1.0;}
void main(){vec4 f=texture2D(donor,uv);vec4 value=texture2D(oldMoment,uv)*(1.0-f.r-f.g-f.b-f.a);vec2 dx=vec2(hop/128.0,0.0),dy=vec2(0.0,hop/128.0);vec2 q=uv-dx;if(inside(q))value+=texture2D(oldMoment,q)*texture2D(donor,q).r;q=uv+dx;if(inside(q))value+=texture2D(oldMoment,q)*texture2D(donor,q).g;q=uv-dy;if(inside(q))value+=texture2D(oldMoment,q)*texture2D(donor,q).b;q=uv+dy;if(inside(q))value+=texture2D(oldMoment,q)*texture2D(donor,q).a;gl_FragColor=value;}`;
export function positiveGpuInput(source,lift){
 const n=128*128;if(source?.length!==n*8||lift?.fractions?.length!==n*4||lift.boundaryDemand!==0||!Number.isInteger(lift.hop)||lift.hop<1||lift.hop>=128)throw Error('Bounded admitted128 positive GPU input required');
 const p=new Float32Array(n*4),c=new Float32Array(n*4),fractions=Float32Array.from(lift.fractions);for(let i=0;i<n;i++){
  let sum=0;for(let d=0;d<4;d++){const f=fractions[i*4+d];if(!Number.isFinite(f)||f<0)throw Error('Finite donor fractions required');sum+=f;const x=i%128,y=Math.floor(i/128),[dx,dy]=[[1,0],[-1,0],[0,1],[0,-1]][d];if(f>0&&(x+dx*lift.hop<0||x+dx*lift.hop>=128||y+dy*lift.hop<0||y+dy*lift.hop>=128))throw Error('Boundary donor escape');}
  // Conservative numerical margin: no hidden clamp/renormalization.
  if(sum>1-1e-6)throw Error('Float32 donor retention margin required');
  for(let k=0;k<8;k++){const v=source[i*8+k];if(!Number.isFinite(v)||v<0)throw Error('Positive finite source required');(k<4?p:c)[i*4+k%4]=v;if(!Number.isFinite((k<4?p:c)[i*4+k%4]))throw Error('Float32 overflow');}
 }
 return{p,c,fractions,hop:lift.hop};
}
/** DEV-only, owned raw resources, explicit known-idle disposal. No engine/canonical imports. */
export function createSmallPositivePairedGpu(gl,{enabled=false,budgetBytes=0}={}){
 if(!enabled)return null;if(budgetBytes<SMALL_POSITIVE_BYTES)throw Error('Explicit1.25MiB owned budget required');
 if(!gl.getExtension('OES_texture_float')||!gl.getExtension('WEBGL_color_buffer_float')||(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision??0)<23)throw Error('Positive Float32 render/highp unsupported; no Q8 fallback');
 const fields=[],shaders=[];let program,quad,disposed=false,initialized=false,front=0,steps=0,prepared;
 const cleanup=()=>{for(const f of fields){gl.deleteTexture(f.texture);gl.deleteFramebuffer(f.fbo)}for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);if(quad)gl.deleteBuffer(quad)};
 const compile=(kind,text)=>{const s=gl.createShader(kind);shaders.push(s);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Positive compile '+gl.getShaderInfoLog(s));return s};
 try{program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,SMALL_POSITIVE_FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Positive link '+gl.getProgramInfoLog(program));quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  for(let i=0;i<5;i++){const texture=gl.createTexture(),fbo=gl.createFramebuffer(),f={texture,fbo};fields.push(f);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,128,128,0,gl.RGBA,gl.FLOAT,null);for(const[k,v]of[[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Positive Float32 FBO incomplete');}
 }catch(error){cleanup();throw error}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0)}
 const position=gl.getAttribLocation(program,'position'),old=gl.getUniformLocation(program,'oldMoment'),donor=gl.getUniformLocation(program,'donor'),hop=gl.getUniformLocation(program,'hop');
 const alive=()=>{if(disposed||gl.isContextLost())throw Error('Positive GPU unavailable')};
 const upload=(f,a)=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,f.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,128,128,gl.RGBA,gl.FLOAT,a)};
 return{bytes:SMALL_POSITIVE_BYTES,get steps(){return steps},initialize({source,lift}){alive();if(initialized)throw Error('One input initialization only');prepared=positiveGpuInput(source,lift);upload(fields[0],prepared.p);upload(fields[1],prepared.c);upload(fields[4],prepared.fractions);if(gl.getError()!==gl.NO_ERROR)throw Error('Positive Float32 upload');initialized=true;},
  step(){alive();if(!initialized||steps>=24)throw Error('Bounded24-step frozen-driver replay only');for(let role=0;role<2;role++){const input=fields[front*2+role],out=fields[(1-front)*2+role];if(input.texture===out.texture||fields[4].texture===out.texture)throw Error('Positive alias');gl.bindFramebuffer(gl.FRAMEBUFFER,out.fbo);gl.viewport(0,0,128,128);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,input.texture);gl.uniform1i(old,0);gl.activeTexture(gl.TEXTURE0+1);gl.bindTexture(gl.TEXTURE_2D,fields[4].texture);gl.uniform1i(donor,1);gl.uniform1f(hop,prepared.hop);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}if(gl.getError()!==gl.NO_ERROR)throw Error('Positive paired draw');front=1-front;steps++;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);},
  readPair({original=false}={}){alive();if(original&&steps>1)throw Error('Original target reused after first step');if(!initialized)throw Error('Initialize before read');const pair={};for(let role=0;role<2;role++){const a=new Float32Array(65536);gl.bindFramebuffer(gl.FRAMEBUFFER,fields[(original?0:front)*2+role].fbo);gl.readPixels(0,0,128,128,gl.RGBA,gl.FLOAT,a);pair[role===0?'p':'c']=a;}gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(gl.getError()!==gl.NO_ERROR)throw Error('Positive Float32 read');return pair;},
  disposeAfterKnownIdle(){if(disposed)return;disposed=true;cleanup()},limitations:['Owned isolated GL state; use standalone diagnostic context, not interleaved engine rendering','Frozen actual captured donor fractions for at most24steps, no time/evolving solver equivalence','No coverage/paper/material/reveal; float moment correctness is not animation acceptance']};
}
/** Float32 operation-order oracle for shader orientation; FMA differences stay tolerance-based. */
export function positiveGpuGatherOracle({p,c,fractions,hop}){
 const output={p:new Float32Array(p.length),c:new Float32Array(c.length)},f=Math.fround;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=y*128+x;let retention=f(1-fractions[i*4]);for(let d=1;d<4;d++)retention=f(retention-fractions[i*4+d]);
  for(const role of ['p','c'])for(let k=0;k<4;k++){let value=f((role==='p'?p:c)[i*4+k]*retention);for(const[xx,yy,d]of[[x-hop,y,0],[x+hop,y,1],[x,y-hop,2],[x,y+hop,3]])if(xx>=0&&xx<128&&yy>=0&&yy<128){const j=yy*128+xx;value=f(value+f((role==='p'?p:c)[j*4+k]*fractions[j*4+d]));}output[role][i*4+k]=value;}
 }
 return output;
}

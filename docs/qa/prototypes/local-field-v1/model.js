// Experimental WebGL1 material, independent of the production renderer/log.
// RGB stores optical pigment mass in byte units; A stores water. Symmetric
// integer edge flux conserves every pigment channel exactly during transport.
export const MODEL_VERSION = 'local-field-v1';
const VERT=`attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.,1.);}`;
const STEP=`precision highp float;varying vec2 uv;uniform sampler2D state;uniform vec2 pixel;uniform float evaporation;
vec4 q(vec2 at){return floor(texture2D(state,clamp(at,pixel*.5,1.-pixel*.5))*255.+.5);}
vec4 flux(vec4 a,vec4 b){vec4 d=b-a;float mobility=.12*max(a.a,b.a)/255.;return sign(d)*floor(abs(d)*vec4(vec3(mobility),.18));}
void main(){vec4 c=q(uv);vec4 next=c+flux(c,q(uv+vec2(pixel.x,0.)))+flux(c,q(uv-vec2(pixel.x,0.)))+flux(c,q(uv+vec2(0.,pixel.y)))+flux(c,q(uv-vec2(0.,pixel.y)));next.a=max(0.,next.a-evaporation);gl_FragColor=next/255.;}`;
const DAB=`precision highp float;uniform vec2 center;uniform float radius;uniform vec3 absorption;uniform float water;uniform float pigment;uniform float pressure;
void main(){float d=length(gl_FragCoord.xy-center)/radius;float mask=1.-smoothstep(.72,1.,d);gl_FragColor=vec4(absorption*pigment*.16*pressure,water*.14*pressure)*mask;}`;
const COPY=`precision highp float;varying vec2 uv;uniform sampler2D state;void main(){gl_FragColor=texture2D(state,uv);}`;
const VIEW=`precision highp float;varying vec2 uv;uniform sampler2D state;uniform vec2 pixel;
float grain(vec2 p){return fract(sin(dot(floor(p),vec2(12.9898,78.233)))*43758.5453);}
void main(){vec3 mass=texture2D(state,uv).rgb;vec3 a=texture2D(state,uv+vec2(pixel.x,0.)).rgb;vec3 b=texture2D(state,uv-vec2(pixel.x,0.)).rgb;float edge=clamp(length(a-b)*2.,0.,.15);float g=grain(uv*1024.);vec3 paper=vec3(.986,.981,.967)*(0.982+.018*g);vec3 color=exp(-mass*4.0*(.93+.14*g+edge));gl_FragColor=vec4(paper*color,1.);}`;
export function createLocalWatercolor(canvas,{resolution=384,auto=true}={}){
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL недоступен');
 const high=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);if(!high?.precision)throw Error('Для этой пробы нужна высокая точность fragment shader');
 const programs=[];const textures=new Set();const fbos=new Set();const N=resolution;let disposed=false;
 const program=fragment=>{const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};const v=compile(gl.VERTEX_SHADER,VERT),f=compile(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));programs.push(p);return p};
 const stepProgram=program(STEP),dabProgram=program(DAB),copyProgram=program(COPY),viewProgram=program(VIEW);
 const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const target=()=>{const texture=gl.createTexture(),fbo=gl.createFramebuffer();textures.add(texture);fbos.add(fbo);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Не удалось создать поле');return{texture,fbo}};
 const release=t=>{gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);textures.delete(t.texture);fbos.delete(t.fbo)};
 let front=target(),back=target(),history=[],cursor=-1,remaining=0,settings=null,raf=0;const queue=[],tape=[];const stats={frames:0,steps:0,dabs:0,maxSubmissionMs:0,historyCopies:0};
 const use=(p,out)=>{gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,out?.fbo??null);gl.viewport(0,0,out?N:canvas.width,out?N:canvas.height);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.bindBuffer(gl.ARRAY_BUFFER,vertices);const loc=gl.getAttribLocation(p,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0)};
 const source=(p,t)=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.uniform1i(gl.getUniformLocation(p,'state'),0)};
 const copy=(from,to)=>{use(copyProgram,to);source(copyProgram,from);gl.drawArrays(gl.TRIANGLES,0,6)};
 const render=()=>{use(viewProgram,null);source(viewProgram,front);gl.uniform2f(gl.getUniformLocation(viewProgram,'pixel'),1/N,1/N);gl.drawArrays(gl.TRIANGLES,0,6)};
 const snapshot=()=>{while(history.length>cursor+1)release(history.pop());const t=target();copy(front,t);history.push(t);cursor=history.length-1;stats.historyCopies++;if(history.length>12){release(history.shift());cursor--}};
 const deposit=({point,s})=>{use(dabProgram,front);const x=point.x/1024*N,y=(1-point.y/1024)*N,r=Math.max(1,s.size/1024*N*.5);gl.enable(gl.SCISSOR_TEST);const x0=Math.max(0,Math.floor(x-r)),y0=Math.max(0,Math.floor(y-r));gl.scissor(x0,y0,Math.max(0,Math.min(N,Math.ceil(x+r))-x0),Math.max(0,Math.min(N,Math.ceil(y+r))-y0));gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.uniform2f(gl.getUniformLocation(dabProgram,'center'),x,y);gl.uniform1f(gl.getUniformLocation(dabProgram,'radius'),r);const rgb=[1,3,5].map(i=>parseInt(s.color.slice(i,i+2),16)/255);gl.uniform3f(gl.getUniformLocation(dabProgram,'absorption'),...rgb.map(c=>Math.min(1,-Math.log(Math.max(.03,c))/3)));for(const key of ['water','pigment'])gl.uniform1f(gl.getUniformLocation(dabProgram,key),s[key]);gl.uniform1f(gl.getUniformLocation(dabProgram,'pressure'),Math.max(.12,point.pressure));gl.drawArrays(gl.TRIANGLES,0,6);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);stats.dabs++;remaining=160};
 const step=(evaporation=2)=>{use(stepProgram,back);source(stepProgram,front);gl.uniform2f(gl.getUniformLocation(stepProgram,'pixel'),1/N,1/N);gl.uniform1f(gl.getUniformLocation(stepProgram,'evaporation'),evaporation);gl.drawArrays(gl.TRIANGLES,0,6);[front,back]=[back,front];stats.steps++;tape.push({type:'step',evaporation})};
 const schedule=()=>{if(auto&&!raf&&!disposed)raf=requestAnimationFrame(frame)};
 const process=(limit=32)=>{let n=0;while(queue.length&&n++<limit){const command=queue.shift();if(command.type==='snapshot')snapshot();else deposit(command)}return n};
 const frame=()=>{raf=0;if(disposed||gl.isContextLost())return;const at=performance.now();process();if(remaining>0){step();remaining--;if(!settings&&!queue.length&&cursor>=0)copy(front,history[cursor])}render();stats.frames++;stats.maxSubmissionMs=Math.max(stats.maxSubmissionMs,performance.now()-at);if(queue.length||remaining>0)schedule()};
 const enqueue=(point,s)=>{const cmd={type:'dab',point:{...point},s:{...s}};queue.push(cmd);tape.push(cmd);schedule()};
 const restore=()=>{copy(history[cursor],front);remaining=0;render()};
 const clear=()=>{queue.length=0;remaining=0;settings=null;for(const t of history)release(t);history=[];cursor=-1;gl.bindFramebuffer(gl.FRAMEBUFFER,front.fbo);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);snapshot();render();tape.length=0;tape.push({type:'clear'})};
 clear();
 return{version:MODEL_VERSION,gl,stats,tape,
 begin(point,s){if(disposed)return;settings={...s};enqueue(point,settings)},
 move(from,to){if(!settings)return;const distance=Math.hypot(to.x-from.x,to.y-from.y),count=Math.max(1,Math.ceil(distance/(settings.size*.1)));for(let i=1;i<=count;i++){const t=i/count;enqueue({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,pressure:from.pressure+(to.pressure-from.pressure)*t},settings)}},
 end(){if(!settings)return;settings=null;queue.push({type:'snapshot'});tape.push({type:'end'});schedule()},
 clear,
 undo(){if(settings)return;process(Infinity);if(cursor>0){cursor--;restore();tape.push({type:'undo'})}},
 redo(){if(settings)return;process(Infinity);if(cursor<history.length-1){cursor++;restore();tape.push({type:'redo'})}},
 exportPNG(){process(Infinity);render();canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='watercolor-local-v1.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})},
 // Explicit readback only for isolated tests, never on DOWN/MOVE/UP.
 read(){gl.bindFramebuffer(gl.FRAMEBUFFER,front.fbo);const bytes=new Uint8Array(N*N*4);gl.readPixels(0,0,N,N,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes},
 upload(bytes){if(bytes.length!==N*N*4)throw Error('Invalid field');gl.bindTexture(gl.TEXTURE_2D,front.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,N,N,gl.RGBA,gl.UNSIGNED_BYTE,bytes)},
 advance(count=1,evaporation=2){process(Infinity);for(let i=0;i<count;i++)step(evaporation);render()},
 destroy(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);for(const texture of textures)gl.deleteTexture(texture);for(const fbo of fbos)gl.deleteFramebuffer(fbo);for(const p of programs)gl.deleteProgram(p);gl.deleteBuffer(vertices)}
 };
}

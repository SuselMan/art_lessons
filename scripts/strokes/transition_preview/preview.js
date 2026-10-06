const canvas = document.querySelector('#view');
const gl = canvas.getContext('webgl', {alpha: false, preserveDrawingBuffer: true});
const error = document.querySelector('#error');
const status = document.querySelector('#status');
const play = document.querySelector('#play');
const dryButton = document.querySelector('#dry');
const slider = document.querySelector('#progress');
const select = document.querySelector('#case');
const duration = document.querySelector('#duration');
const loop = document.querySelector('#loop');
let state, cases, playing = false, start = 0, progress = 0, raf = 0, generation = 0;
let initialProgress = 0, segmentMs = 12_000, initialVelocity = 0, velocity = 0, accelerated = false;
const vert = 'attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}';
const frag = `precision highp float;
uniform sampler2D u_wet,u_dry,u_forward,u_backward;
uniform vec2 u_size;
uniform float u_progress,u_variant,u_range,u_baselineScale;
varying vec2 v_uv;
float smooth(float t){return t*t*t*(t*(t*6.0-15.0)+10.0);}
vec2 flow(sampler2D tex, vec2 uv){vec3 f=texture2D(tex,uv).rgb;return vec2(1.0,-1.0)*(f.rg*2.0-1.0)*u_range*f.b/u_size;}
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cloud(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(noise(i),noise(i+vec2(1.,0.)),f.x),mix(noise(i+vec2(0.,1.)),noise(i+vec2(1.,1.)),f.x),f.y);}
vec4 paper(vec4 c){return vec4(c.rgb*c.a+vec3(1.0-c.a),1.0);}
void main(){
 vec4 wet=texture2D(u_wet,v_uv),dry=texture2D(u_dry,v_uv);
 if(u_progress<=0.0){gl_FragColor=paper(wet);return;}
 if(u_progress>=1.0){gl_FragColor=paper(dry);return;}
 float t=smooth(u_progress);
 if(u_variant<0.5){float raw=min(1.0,u_progress*u_baselineScale);t=1.0-(1.0-raw)*(1.0-raw);}
 if(u_variant>1.5&&u_variant<2.5){
   wet=texture2D(u_wet,v_uv-t*flow(u_forward,v_uv));
   dry=texture2D(u_dry,v_uv-(1.0-t)*flow(u_backward,v_uv));
 }
 if(u_variant>2.5){float offset=(cloud(v_uv*u_size/50.0)-0.5)*0.5;t=smooth(u_progress+offset*4.0*u_progress*(1.0-u_progress));}
 wet.rgb*=wet.a;dry.rgb*=dry.a;vec4 c=mix(wet,dry,t);
 gl_FragColor=vec4(c.rgb+vec3(1.0-c.a),1.0);
}`;
function shader(type, source) {
  const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s)); return s;
}
function init() {
  if (!gl) throw Error('WebGL недоступен. Попробуй открыть страницу в другом браузере.');
  const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, vert)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  gl.useProgram(p); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(p, 'a_position'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const uniforms = {}; for (const name of ['size','progress','variant','range','baselineScale','wet','dry','forward','backward']) uniforms[name] = gl.getUniformLocation(p, `u_${name}`);
  ['wet','dry','forward','backward'].forEach((name,i) => gl.uniform1i(uniforms[name], i));
  return uniforms;
}
let u;
async function texture(path) {
  const im = new Image(); im.src = path; await im.decode();
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im); return t;
}
function draw() {
  if (!state) return;
  const dpr = Math.min(devicePixelRatio,2), r = canvas.getBoundingClientRect();
  const w = Math.round(r.width*dpr/2)*2, h = Math.round(r.height*dpr/2)*2;
  if (canvas.width!==w||canvas.height!==h) {canvas.width=w;canvas.height=h;}
  gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT);
  state.textures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);});
  gl.uniform2f(u.size,...state.data.size);gl.uniform1f(u.progress,progress);gl.uniform1f(u.range,state.data.flowRange);
  gl.uniform1f(u.baselineScale,Number(duration.value)/1.5);
  for(let i=0;i<4;i++){
    const pw=w/2,ph=h/2;const scale=Math.min((pw-24)/state.data.size[0],(ph-36)/state.data.size[1]);
    const iw=Math.round(state.data.size[0]*scale),ih=Math.round(state.data.size[1]*scale);
    const x=Math.round((i%2)*pw+(pw-iw)/2),y=Math.round((1-Math.floor(i/2))*ph+(ph-ih)/2-8);
    gl.viewport(x,y,iw,ih);gl.uniform1f(u.variant,i);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  status.textContent = progress===1 ? 'Все варианты пришли к одной сухой картинке.' : `${Math.round(progress*100)}% перехода`;
}
function stop(){playing=false;cancelAnimationFrame(raf);play.textContent='Проиграть вместе';}
function sample(now){
 const t=Math.min(1,Math.max(0,(now-start)/segmentMs));
 if(accelerated){
  // Hermite joins the current speed and position, then arrives gently at dry.
  const m=Math.min(initialVelocity*segmentMs,3*(1-initialProgress));
  progress=(2*t*t*t-3*t*t+1)*initialProgress+(t*t*t-2*t*t+t)*m+(-2*t*t*t+3*t*t);
  velocity=((6*t*t-6*t)*initialProgress+(3*t*t-4*t+1)*m+(-6*t*t+6*t))/segmentMs;
 }else{progress=initialProgress+(1-initialProgress)*t;velocity=(1-initialProgress)/segmentMs;}
 if(t===1){progress=1;velocity=0;}return t;
}
function tick(now){if(!playing)return;const t=sample(now);slider.value=Math.round(progress*1000);draw();if(t<1)raf=requestAnimationFrame(tick);else if(loop.checked&&!accelerated){raf=requestAnimationFrame(function pause(time){if(time-now<900){raf=requestAnimationFrame(pause);return;}start=time;initialProgress=0;segmentMs=Number(duration.value)*1000;progress=0;raf=requestAnimationFrame(tick);});}else stop();}
async function load(index){stop();play.disabled=true;dryButton.disabled=true;error.textContent='';const token=++generation;try{const data=cases[index];const textures=[];for(const key of ['wet','dry','forward','backward'])textures.push(await texture(`assets/${data[key]}`));if(token!==generation){textures.forEach(t=>gl.deleteTexture(t));return;}state?.textures.forEach(t=>gl.deleteTexture(t));state={data,textures};progress=0;velocity=0;slider.value=0;draw();play.disabled=false;dryButton.disabled=false;}catch(e){error.textContent=`Не удалось загрузить мазок: ${e.message}`;}}
play.onclick=()=>{if(playing){stop();return;}progress=0;initialProgress=0;initialVelocity=0;accelerated=false;segmentMs=Number(duration.value)*1000;start=performance.now();playing=true;play.textContent='Пауза';raf=requestAnimationFrame(tick);};
dryButton.onclick=()=>{const now=performance.now();if(playing)sample(now);if(progress>=1)return;initialProgress=progress;initialVelocity=playing?Math.max(0,velocity):0;segmentMs=initialVelocity>0?Math.min(2000,(1-progress)/initialVelocity):2000;accelerated=true;start=now;cancelAnimationFrame(raf);playing=true;play.textContent='Пауза';slider.value=Math.round(progress*1000);draw();raf=requestAnimationFrame(tick);};
slider.oninput=()=>{stop();progress=Number(slider.value)/1000;draw();};select.onchange=()=>load(Number(select.value));duration.onchange=()=>{stop();draw();};window.addEventListener('resize',draw);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stop();error.textContent='Графический контекст потерян. Перезагрузи страницу.';});
try{u=init();const response=await fetch('assets/cases.json',{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);cases=(await response.json()).cases;if(!cases.length)throw Error('Нет захваченных мазков');for(const [i,c] of cases.entries())select.add(new Option(c.label,String(i)));await load(0);}catch(e){error.textContent=e.message;status.textContent='';}
// Inspection hook belongs only to this standalone prototype, never Grafetto.
window.__transitionPreview={get state(){return state;},setProgress(t){stop();progress=t;draw();},gl};

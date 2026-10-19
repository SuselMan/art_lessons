import {EXPANSION_FRONT_FRAG_805} from '../native-expansion-805/expansion'
import {grid,exchanges} from './grid.cjs'
export function mountTileStep805(elements:Record<string,HTMLElement>,brushSettings?:()=>{size:number;water:number;pigment:number;color:string}){
const $=(id:string)=>elements[id] as any
let alive=true,released=false
const release=()=>{if(released)return;released=true;destroy(zero);gl.deleteProgram(prog);gl.deleteBuffer(quad)}
const status=$('status'),view=$('result') as HTMLCanvasElement,ink=$('ink') as HTMLCanvasElement
const gpu=document.createElement('canvas'),gl=gpu.getContext('webgl',{antialias:false,depth:false,stencil:false})!
if(!gl)throw Error('WebGL unavailable')
const shader=(type:number,text:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)!);return s}
const prog=gl.createProgram()!,vs=shader(gl.VERTEX_SHADER,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}'),fs=shader(gl.FRAGMENT_SHADER,EXPANSION_FRONT_FRAG_805)
gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog)!);gl.deleteShader(vs);gl.deleteShader(fs)
const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
const names=['cost','waterA','waterB','noiseMap','resolution','maximum','budget','radius','outward','noisy','stride'],u=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(prog,n)]))
function buffer(w:number,h:number,bytes:Uint8Array){const tex=gl.createTexture()!,fbo=gl.createFramebuffer()!;gl.bindTexture(gl.TEXTURE_2D,tex);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete framebuffer');return{tex,fbo,w,h}}
function destroy(b:ReturnType<typeof buffer>){gl.deleteTexture(b.tex);gl.deleteFramebuffer(b.fbo)}
const zero=buffer(1,1,new Uint8Array(4)),frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()))
let waveWidth=0,waveHeight=0,waves=new Float64Array(0)
function input(x:number,y:number,w:number,h:number){if(waveWidth!==w||waveHeight!==h){waves=Float64Array.from({length:w},(_,xx)=>h*(.5+.23*Math.sin(xx/w*Math.PI*5)));waveWidth=w;waveHeight=h}const valid=x>=0&&y>=0&&x<w&&y<h,wave=valid?waves[x]:0,dx=x-w*.5,dy=y-h*.5,hole=dx*dx+dy*dy<(Math.min(w,h)*.09)**2;return{wet:valid&&Math.abs(y-wave)<190&&!hole,seed:Math.abs(y-wave)<8&&x>w*.04&&x<w*.96}}

async function calculate(w:number,h:number,size:number,mode:string,sample:typeof input,color:string){
 const started=performance.now(),tiles=grid(w,h,mode==='whole'?Math.max(w,h):size,2),copies=exchanges(tiles),owned:any[]=[],stats={width:w,height:h,size,mode,tiles:tiles.length,steps:12,setupMs:0,submitMs:0,exchangeSubmitMs:0,readAndPreviewMs:0,totalMs:0,rafMaxMs:0,draws:0,copies:0,rgbaBytes:0};let previous=0,stop=false
 const heartbeat=(now:number)=>{if(stop)return;if(previous)stats.rafMaxMs=Math.max(stats.rafMaxMs,now-previous);previous=now;if(!stop)requestAnimationFrame(heartbeat)};requestAnimationFrame(heartbeat)
 try{
 const fields=[] as any[]
 for(const t of tiles){if(!alive)throw Error('Расчёт остановлен');const tw=t.w+4,th=t.h+4;if(Math.max(tw,th)>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('Texture exceeds device limit');const water=new Uint8Array(tw*th*4),cost=new Uint8Array(tw*th*4);for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const {wet,seed}=sample(t.x+xx-2,t.y+yy-2,w,h),at=(yy*tw+xx)*4;water[at+3]=wet?255:0;cost[at]=wet&&seed?0:255;cost[at+1]=128;cost[at+3]=255}const a=buffer(tw,th,cost),b=buffer(tw,th,cost),waterMap=buffer(tw,th,water);owned.push(a,b,waterMap);fields.push({...t,a,b,water:waterMap});stats.rgbaBytes+=tw*th*12;await frame()}
 stats.setupMs=performance.now()-started
 for(let step=0;step<12;step++){if(!alive)throw Error('Расчёт остановлен');
 for(const t of fields){const tick=performance.now();gl.bindFramebuffer(gl.FRAMEBUFFER,t.b.fbo);gl.viewport(0,0,t.b.w,t.b.h);gl.enable(gl.SCISSOR_TEST);gl.scissor(2,2,t.w,t.h);gl.disable(gl.BLEND);gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const p=gl.getAttribLocation(prog,'pos');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);for(const [i,name,b]of [[0,'cost',t.a],[1,'waterA',t.water],[2,'waterB',zero],[3,'noiseMap',zero]] as const){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,b.tex);gl.uniform1i(u[name],i)}gl.uniform2f(u.resolution,t.a.w,t.a.h);for(const [n,v]of Object.entries({maximum:64,budget:60,radius:24,outward:1,noisy:0,stride:2}))gl.uniform1f(u[n],v);gl.drawArrays(gl.TRIANGLES,0,6);stats.draws++;stats.submitMs+=performance.now()-tick}
 gl.disable(gl.SCISSOR_TEST)
 // Barrier in command ORDER, no readback/finish. Every new core already
 // submitted; copies read only those cores, never a partially updated halo.
 const tick=performance.now();if(mode==='exchange')for(const c of copies){gl.bindFramebuffer(gl.FRAMEBUFFER,fields[c.src].b.fbo);gl.bindTexture(gl.TEXTURE_2D,fields[c.dst].b.tex);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,c.dx,c.dy,c.sx,c.sy,c.w,c.h);stats.copies++}stats.exchangeSubmitMs+=performance.now()-tick
 for(const t of fields)[t.a,t.b]=[t.b,t.a]
 gl.flush();status.textContent=`Шаг ${step+1} / 12 · ${tiles.length} тайлов`;await frame()
 }
 const readStart=performance.now(),pixels=new Uint8Array(w*h)
 for(const t of fields){const bytes=new Uint8Array(t.w*t.h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.a.fbo);gl.readPixels(2,2,t.w,t.h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);for(let yy=0;yy<t.h;yy++)for(let xx=0;xx<t.w;xx++)pixels[(t.y+yy)*w+t.x+xx]=bytes[(yy*t.w+xx)*4]}
 render(pixels,w,h,sample,color);stats.readAndPreviewMs=performance.now()-readStart;await frame();stats.totalMs=performance.now()-started
 if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error during tile calculation')
 let reached=0,seeds=0;for(const c of pixels){if(c<250)reached++;if(c===0)seeds++}return{stats,pixels,reached,seeds}
 }finally{stop=true;gl.disable(gl.SCISSOR_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);for(const b of owned)destroy(b)}
}
function render(pixels:Uint8Array,w:number,h:number,sample:typeof input,color:string){const ctx=view.getContext('2d')!,preview=ctx.createImageData(view.width,view.height),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 for(let y=0;y<view.height;y++)for(let x=0;x<view.width;x++){const wx=Math.min(w-1,Math.floor(x*w/view.width)),wy=Math.min(h-1,Math.floor(y*h/view.height)),c=pixels[wy*w+wx],wet=sample(wx,wy,w,h).wet,at=(y*view.width+x)*4;preview.data[at]=c<250?rgb[0]:wet?218:250;preview.data[at+1]=c<250?rgb[1]:wet?225:249;preview.data[at+2]=c<250?rgb[2]:wet?230:246;preview.data[at+3]=255}ctx.putImageData(preview,0,0);}
type Stroke={points:{x:number;y:number}[];size:number;water:number;pigment:number;color:string}
const strokes:Stroke[]=[]
let activeStroke:Stroke|null=null,busy=false,pending=false
const settings=()=>brushSettings?.()??{size:320,water:95,pigment:34,color:'#2688d3'}
function freezeInput(w:number,h:number){
 const frozen=strokes.map(s=>({...s,points:s.points.map(p=>({...p}))}))
 if(!frozen.length)return{sample:input,color:'#2864b4',strokes:0}
 const mask=document.createElement('canvas');mask.width=w;mask.height=h;const ctx=mask.getContext('2d',{willReadFrequently:true})!;ctx.globalCompositeOperation='lighter'
 for(const s of frozen){ctx.strokeStyle=ctx.fillStyle=`rgb(${Math.round(s.water*2.55)},${Math.round(s.pigment*2.55)},0)`;ctx.lineWidth=s.size;ctx.lineCap=ctx.lineJoin='round';const p=s.points[0];if(s.points.length===1){ctx.beginPath();ctx.arc(p.x*w,p.y*h,s.size/2,0,Math.PI*2);ctx.fill()}else{ctx.beginPath();ctx.moveTo(p.x*w,p.y*h);for(const p of s.points.slice(1))ctx.lineTo(p.x*w,p.y*h);ctx.stroke()}}
 const bytes=ctx.getImageData(0,0,w,h).data;mask.width=mask.height=1
 const sample=(x:number,y:number,_w:number,_h:number)=>{if(x<0||y<0||x>=w||y>=h)return{wet:false,seed:false};const at=(y*w+x)*4;return{wet:bytes[at]>0,seed:bytes[at+1]>0}}
 return{sample,color:frozen.findLast(s=>s.pigment>0)?.color??settings().color,strokes:frozen.length}
}
async function run(compare=false){if(busy)return;busy=true;$('sheet').disabled=true;$('run').disabled=$('compare').disabled=true;try{const[w,h]=$('sheet').value.split(',').map(Number),size=Number($('tile').value),mode=$('mode').value;const height=Math.round(view.width*h/w);if(view.height!==height)view.height=height;if(ink.height!==height)ink.height=height;const source=freezeInput(w,h);const a=await calculate(w,h,size,mode,source.sample,source.color);if(!alive)throw Error('Расчёт остановлен');let difference:any=null;if(compare){const b=await calculate(w,h,size,'whole',source.sample,source.color);if(!alive)throw Error('Расчёт остановлен');let count=0,max=0;for(let i=0;i<a.pixels.length;i++){const d=Math.abs(a.pixels[i]-b.pixels[i]);if(d)count++;max=Math.max(max,d)}difference={count,max,whole:b.stats};render(a.pixels,w,h,source.sample,source.color);}const s=a.stats;status.textContent=`${s.tiles} тайлов · ${w} × ${h}\nВсего ${s.totalMs.toFixed(1)} мс; подготовка ${s.setupMs.toFixed(1)}; чтение и превью ${s.readAndPreviewMs.toFixed(1)}\nМакс. интервал кадров ${s.rafMaxMs.toFixed(1)} мс; память текстур ${(s.rgbaBytes/1048576).toFixed(1)} МиБ`+(difference?`\nОтличающихся пикселей от целой области: ${difference.count}; макс. разница ${difference.max}/255`:'');(window as any).__tileStepResult={stats:s,difference,sourceStrokes:source.strokes,sourceColor:source.color,reached:a.reached,seeds:a.seeds,gpu:gl.getParameter(gl.RENDERER),qualification:'Path-finding only; not full pigment solver or real brush'};return(window as any).__tileStepResult}catch(e){if(alive)status.textContent=String(e);throw e}finally{busy=false;if(alive){$('sheet').disabled=false;$('run').disabled=$('compare').disabled=false;}else release();if(pending&&alive){pending=false;void run().catch(()=>{})}}}
$('run').onclick=()=>void run().catch(()=>{});$('compare').onclick=()=>void run(true).catch(()=>{});(window as any).__tileStepRun=run
const pen=ink.getContext('2d')!;let last:{x:number;y:number}|null=null
function point(e:PointerEvent){const r=ink.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}}
function mark(p:{x:number;y:number},previous:{x:number;y:number}|null,s:Stroke){const w=Number($('sheet').value.split(',')[0]),width=s.size*ink.width/w;pen.lineWidth=width;pen.lineCap=pen.lineJoin='round';const draw=(color:string)=>{pen.strokeStyle=pen.fillStyle=color;pen.beginPath();if(previous){pen.moveTo(previous.x*ink.width,previous.y*ink.height);pen.lineTo(p.x*ink.width,p.y*ink.height);pen.stroke()}else{pen.arc(p.x*ink.width,p.y*ink.height,width/2,0,Math.PI*2);pen.fill()}};if(s.water>0)draw(`rgba(130,145,155,${s.water*.003})`);if(s.pigment>0){pen.globalAlpha=s.pigment/100;draw(s.color);pen.globalAlpha=1}}
ink.onpointerdown=e=>{if(last||!alive)return;e.preventDefault();ink.setPointerCapture(e.pointerId);last=point(e);activeStroke={...settings(),points:[last]};strokes.push(activeStroke);mark(last,null,activeStroke)}
ink.onpointermove=e=>{if(!last||!activeStroke)return;e.preventDefault();for(const event of e.getCoalescedEvents?.().length?e.getCoalescedEvents():[e]){const p=point(event);activeStroke.points.push(p);mark(p,last,activeStroke);last=p}}
const finish=(e:PointerEvent)=>{if(!last)return;e.preventDefault();last=null;activeStroke=null;status.textContent='Мазок добавлен · расчёт путей…';if(busy)pending=true;else void run().catch(()=>{})}
ink.onpointerup=finish;ink.onpointercancel=e=>{last=null;activeStroke=null;try{ink.releasePointerCapture(e.pointerId)}catch{}};ink.oncontextmenu=e=>e.preventDefault()
$('sheet').onchange=()=>{if(busy){status.textContent='Сначала дождитесь окончания расчёта';return}strokes.length=0;last=null;activeStroke=null;const[w,h]=$('sheet').value.split(',').map(Number);view.height=ink.height=Math.round(view.width*h/w);view.getContext('2d')!.clearRect(0,0,view.width,view.height);status.textContent='Чистый лист · можно рисовать'}

return{run,settings,destroy(){alive=false;last=null;if(!busy)release();delete(window as any).__tileStepRun;delete(window as any).__tileStepResult}}
}

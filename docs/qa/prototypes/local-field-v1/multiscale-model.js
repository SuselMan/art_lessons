import { PencilEngine } from '/src/engine/index.ts';
import { AccumulationBuffer } from '/src/engine/src/buffers/AccumulationBuffer.ts';
import { RibbonScratchPool } from '/src/engine/src/buffers/RibbonScratchPool.ts';
import { WatercolorPresentationRaster } from '/src/engine/src/watercolor/WatercolorPresentationRaster.ts';
import { ribbonProfileFor } from '/src/engine/src/dabs/ribbonProfile.ts';
import { watercolorPresetString } from '/src/engine/src/presets/watercolorPresets.ts';
import { createProgram } from '/src/engine/src/raster/utils.ts';
const VERT = 'attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}';
const OPTICS = `vec3 depth(vec4 c){return -log(clamp(c.rgb/max(c.a,.0001),.025,1.))*c.a/4.;}`;
const REDUCE = `precision highp float;varying vec2 uv;uniform sampler2D fine;uniform vec2 texel;${OPTICS}
void main(){vec3 sum=vec3(0.);for(int y=0;y<4;y++)for(int x=0;x<4;x++)sum+=depth(texture2D(fine,uv+vec2(float(x)-1.5,float(y)-1.5)*texel));gl_FragColor=vec4(sum/16.,0.);}`;
const INJECT = `precision highp float;varying vec2 uv;uniform sampler2D state,oldSource,newSource;uniform vec2 start,end;uniform float radius,water;
void main(){vec2 d=end-start;float t=clamp(dot(uv-start,d)/max(dot(d,d),.0000001),0.,1.);float wet=1.-smoothstep(radius*.65,radius,length(uv-start-t*d));vec3 delta=texture2D(newSource,uv).rgb-texture2D(oldSource,uv).rgb;vec4 c=texture2D(state,uv);gl_FragColor=vec4(clamp(c.rgb+.3*delta,0.,1.),max(c.a,water*wet));}`;
// Integer symmetric edge flux. Out-of-domain edges are sealed. RGB is
// optical-density mass, A is water; evaporation changes only A.
const STEP = `precision highp float;varying vec2 uv;uniform sampler2D state;uniform vec2 pixel;
vec4 q(vec2 p){return floor(texture2D(state,p)*255.+.5);}
vec4 edge(vec4 c,vec2 offset,float weight){vec2 p=uv+offset*pixel;if(p.x<0.||p.y<0.||p.x>1.||p.y>1.)return vec4(0.);vec4 n=q(p);vec4 d=n-c;return sign(d)*floor(abs(d)*vec4(vec3(weight*max(c.a,n.a)/255.),weight*1.4));}
void main(){vec4 c=q(uv);vec4 s=c+edge(c,vec2(1,0),.08)+edge(c,vec2(-1,0),.08)+edge(c,vec2(0,1),.08)+edge(c,vec2(0,-1),.08)+edge(c,vec2(1,1),.025)+edge(c,vec2(-1,1),.025)+edge(c,vec2(1,-1),.025)+edge(c,vec2(-1,-1),.025);s.a=max(0.,s.a-2.);gl_FragColor=s/255.;}`;
const VIEW = `precision highp float;varying vec2 uv;uniform sampler2D fine,source,state,previous,paper;uniform float blend;${OPTICS}
void main(){vec3 detailed=depth(texture2D(fine,uv));vec3 base=texture2D(source,uv).rgb;vec3 mobile=mix(texture2D(previous,uv).rgb,texture2D(state,uv).rgb,blend);vec3 ratio=clamp(detailed/max(base,vec3(.0001)),0.,4.);vec3 relief=mix(vec3(1.),.35+.65*ratio,step(vec3(.002),base));vec3 tau=.7*detailed+mobile*relief;float grain=texture2D(paper,uv).r;vec3 substrate=vec3(.991,.987,.976)*(.975+.025*grain);gl_FragColor=vec4(substrate*exp(-tau*4.),1.);}`;
export async function createMultiscaleWatercolor(canvas,{size=1024,fineSize=Math.min(size,768),auto=true}={}) {
  canvas.width=canvas.height=size;
  const engine=new PencilEngine(canvas,{userId:'multiscale',pageWidth:size,pageHeight:size,paper:'fine'});
  engine._pointer.destroy(); engine._display=()=>{}; engine._scheduleDisplay=()=>{};
  await engine.paperReady();
  const gl=engine.gl, n=fineSize/4;
  const pool=new RibbonScratchPool(gl);
  const fine=new AccumulationBuffer(gl,fineSize,fineSize);fine.clear();
  const extent={originX:0,originY:0,worldWidth:size,worldHeight:size,width:fineSize,height:fineSize};
  let raster=new WatercolorPresentationRaster(fine,extent,pool,{...engine._ribbonPainterContext,markPaperDamage:()=>{}});
  const buffers=Array.from({length:4},()=>new AccumulationBuffer(gl,n,n,'nearest'));buffers.forEach(b=>b.clear());
  let [front,back,source,nextSource]=buffers;
  const programs=[REDUCE,INJECT,STEP,VIEW].map(f=>createProgram(gl,VERT,f));
  const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const loc=programs.map(p=>{const names=['fine','texel','state','oldSource','newSource','start','end','radius','water','pixel','source','previous','paper','blend'];return Object.fromEntries(names.map(k=>[k,gl.getUniformLocation(p,k)]))});
  const queue=[],tape=[];let redoTape=null;let raf=0,disposed=false,remaining=0,tickAt=performance.now(),frameAt=0,drying=0,gesture=0,gestureAt=0,active=null,last=null;
  const stats={steps:0,frames:0,paintBatches:0,fineSize,grid:n,gpuBytes:(fineSize*fineSize*24+n*n*4)*4};
  const use=(i,out)=>{if(out)out.beginReplaceDraw();else{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,size,size);gl.disable(gl.BLEND)}gl.disable(gl.SCISSOR_TEST);const p=programs[i];gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,vertices);const a=gl.getAttribLocation(p,'p');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);return loc[i]};
  const texture=(u,name,texture,unit)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(u[name],unit)};
  const draw=()=>{gl.drawArrays(gl.TRIANGLES,0,6);gl.bindFramebuffer(gl.FRAMEBUFFER,null)};
  const render=(blend=1)=>{const u=use(3,null);texture(u,'fine',fine.texture,0);texture(u,'source',source.texture,1);texture(u,'state',front.texture,2);texture(u,'previous',back.texture,3);texture(u,'paper',engine._paperTex,4);gl.activeTexture(gl.TEXTURE5);for(const b of [source,front,back]){gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)}gl.uniform1f(u.blend,blend);draw();for(const b of [source,front,back]){gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST)}gl.activeTexture(gl.TEXTURE0);stats.frames++};
  const step=()=>{const u=use(2,back);texture(u,'state',front.texture,0);gl.uniform2f(u.pixel,1/n,1/n);draw();[front,back]=[back,front];remaining=Math.max(0,remaining-1);stats.steps++;tape.push({type:'tick'})};
  const paint=command=>{
    const {dabs,s,id,from,to}=command;const name=watercolorPresetString('normal',{water:s.water,pigment:s.pigment},s.code);
    const color=[1,3,5].map(i=>parseInt(s.color.slice(i,i+2),16)/255);
    raster.paint(id,dabs,engine._resolvePreset('watercolor',name),name,ribbonProfileFor('watercolor',name),color,undefined,[.37,.61],command.now);
    let u=use(0,nextSource);texture(u,'fine',fine.texture,0);gl.uniform2f(u.texel,1/fineSize,1/fineSize);draw();
    u=use(1,back);texture(u,'state',front.texture,0);texture(u,'oldSource',source.texture,1);texture(u,'newSource',nextSource.texture,2);
    gl.uniform2f(u.start,from.x/size,1-from.y/size);gl.uniform2f(u.end,to.x/size,1-to.y/size);gl.uniform1f(u.radius,s.size*.5/size);gl.uniform1f(u.water,s.water);draw();
    [front,back]=[back,front];[source,nextSource]=[nextSource,source];front.copyTo(back);tickAt=performance.now();remaining=128;stats.paintBatches++;
  };
  const schedule=()=>{if(auto&&!raf&&!disposed)raf=requestAnimationFrame(frame)};
  const frame=now=>{
    raf=0;if(disposed)return;if(gl.isContextLost())return
    if(now-frameAt<30){schedule();return}frameAt=now;
    let processed=0;
    while(!drying&&queue.length&&processed++<8){const c=queue.shift();if(c.type==='dry')drying=remaining;else if(c.type==='tick')step();else{paint(c);if(c.replay)tape.push({...c,replay:undefined})}}
    if(drying){const count=Math.min(16,drying);for(let i=0;i<count;i++)step();drying-=count;if(!drying)raster.paperWet.clear();tickAt=now;render(1)}
    else{if(remaining&&now-tickAt>=1000){step();if(!remaining)raster.paperWet.clear();tickAt=now}render(remaining?Math.min(1,(now-tickAt)/1000):1)}
    if(queue.length||remaining||drying)schedule();
  };
  const enqueue=(dabs,s,from,to)=>{const c={type:'paint',id:String(gesture),dabs,s:{...s},from:{...from},to:{...to},now:performance.now()};queue.push(c);tape.push(structuredClone(c));schedule()};
  const dab=(p,s)=>({x:p.x,y:p.y,pressure:p.pressure,tiltX:0,tiltY:0,size:s.size,aspectRatio:1,angle:0,opacity:1,t:Math.max(0,(p.time??performance.now())-gestureAt)});
  render();
  return {version:'multiscale-v1',stats,tape,gl,
    begin(p,s){redoTape=null;gesture++;gestureAt=p.time??performance.now();active={...s};last={...p};enqueue([dab(p,s)],active,p,p)},
    move(p){if(!active)return;const length=Math.hypot(p.x-last.x,p.y-last.y),count=Math.max(1,Math.ceil(length/(active.size*.12)));const dabs=[];for(let i=1;i<=count;i++){const t=i/count;dabs.push(dab({x:last.x+(p.x-last.x)*t,y:last.y+(p.y-last.y)*t,pressure:last.pressure+(p.pressure-last.pressure)*t,time:(last.time??gestureAt)+((p.time??performance.now())-(last.time??gestureAt))*t},active))}enqueue(dabs,active,last,p);last={...p}},
    end(){active=null;last=null},
    dry(){queue.push({type:'dry'});tape.push({type:'dry'});schedule()},
    get pending(){return !!(queue.length||drying)},get wet(){return remaining>0},
    advance(count=1){while(queue.length){const c=queue.shift();if(c.type==='dry')drying=remaining;else if(c.type==='tick')step();else{paint(c);if(c.replay)tape.push({...c,replay:undefined})}}for(let i=0;i<count;i++)step();drying=Math.max(0,drying-count);render()},
    replay(entries){this.clear();queue.push(...structuredClone(entries).filter(c=>c.type!=='dry').map(c=>({...c,replay:true})));this.advance(0)},
    undo(){if(active||queue.length||drying)return;const saved=structuredClone(tape);const lastPaint=[...saved].reverse().find(c=>c.type==='paint');if(!lastPaint)return;const end=saved.findIndex(c=>c.type==='paint'&&c.id===lastPaint.id);this.clear();redoTape=saved;queue.push(...saved.slice(0,end).filter(c=>c.type!=='dry').map(c=>({...c,replay:true})));schedule()},
    redo(){if(active||queue.length||!redoTape)return;const saved=redoTape;this.clear();redoTape=null;queue.push(...saved.filter(c=>c.type!=='dry').map(c=>({...c,replay:true})));schedule()},
    read(){return front.readPixels()},
    exportPNG(){render(1);return new Promise(resolve=>canvas.toBlob(resolve))},
    clear(){queue.length=0;remaining=drying=0;active=null;redoTape=null;raster.release(false);fine.clear();buffers.forEach(b=>b.clear());raster=new WatercolorPresentationRaster(fine,extent,pool,{...engine._ribbonPainterContext,markPaperDamage:()=>{}});tape.length=0;render()},
    destroy(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);raster.release(gl.isContextLost());if(!gl.isContextLost()){pool.destroy();fine.destroy();buffers.forEach(b=>b.destroy());programs.forEach(p=>gl.deleteProgram(p));gl.deleteBuffer(vertices)}engine.destroy()}
  };
}

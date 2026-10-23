(async ({input}) => {
 window.__ringQA={phase:'timeline-import'};
 const {PencilEngine}=await import('/src/engine/index.ts');
 const original=WebGLRenderingContext.prototype.shaderSource;const hits={dab:0,paper:0};
 WebGLRenderingContext.prototype.shaderSource=function(shader,source){
  if(source.includes('const float WC_FRESH_SHADE')){source=input.paper;hits.paper++;}
  else if(source.includes('vec3 tauHere =')){source=input.dab;hits.dab++;}
  return original.call(this,shader,source);
 };
 let e;const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 canvas.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vw;z-index:9999';document.body.append(canvas);
 try{e=new PencilEngine(canvas,{pageWidth:512,pageHeight:512,paper:'fine'});}finally{WebGLRenderingContext.prototype.shaderSource=original;}
 window.__timelineEngine=e;window.__ringQA.phase='paper';await e.paperReady();
 e.setBaseLayers(['layer-1']);e.setActiveLayer('layer-1');e.setCompositeOrder([{id:'layer-1',opacity:1}]);e.setUserId('timeline-qa');e.setTool('watercolor');e.setLocked(false);e.setColor([.2235294,0,.6]);
 const frames=[];let running=true,last=0;function tick(t){if(!running)return;if(last)frames.push({t,dt:t-last,phase:window.__ringQA.phase});last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);
 window.__timelineStopFrames=()=>{running=false;return frames;};
 window.__timelineStroke=async(preset,size,points,ms)=>{
  e.setPencil(preset);e.setSize(size);const t0=performance.now();
  const data=(x,y,t)=>({x,y,pressure:.8,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp:t});
  e._onStart(data(...points[0],t0));
  while(performance.now()-t0<ms){await new Promise(r=>requestAnimationFrame(r));const t=performance.now(),v=Math.min(1,(t-t0)/ms)*(points.length-1),k=Math.min(points.length-2,Math.floor(v)),f=v-k;e._onMove(data(points[k][0]*(1-f)+points[k+1][0]*f,points[k][1]*(1-f)+points[k+1][1]*f,t));}
  e._onEnd(data(...points.at(-1),performance.now()));window.__ringQA.liftAt=performance.now();
 };
 window.__ringQA.phase='ready';return{hits,source:input.base,hashes:input.hashes,gl:e.gl.getError(),lost:e.gl.isContextLost(),gpu:e.gpuInfo(),viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},page:[512,512]};
})

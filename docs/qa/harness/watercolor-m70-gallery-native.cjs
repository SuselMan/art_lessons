// Native-scale isolated gallery samples. Translation only; no spatial scaling.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.GALLERY_PLAYWRIGHT||'@playwright/test');
const work=process.env.GALLERY_WORK;if(!work)throw Error('GALLERY_WORK required');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']});try{
 const p=await b.newPage({viewport:{width:1024,height:800}});p.setDefaultTimeout(600000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto((process.env.GALLERY_BASE||'http://localhost:5384')+'/create');
 const cases=JSON.parse(fs.readFileSync(path.join(work,'cases.json')));fs.mkdirSync(path.join(work,'output'),{recursive:true});
 for(const item of cases){const key='sample'+item.sheet+'-'+item.n;if(fs.existsSync(path.join(work,'output',key+'.json')))continue;console.log('START',key);
 const result=await p.evaluate(async({ops,origin,rect})=>{
  const {PencilEngine}=await import('/src/engine/index.ts');const {strokeDabs,packDabs}=await import('/@fs/home/suselman/projects/pencil-agents/728-watercolor-room-integration/packages/shared/src/index.ts');
  const c=document.createElement('canvas');c.width=1024;c.height=800;document.body.append(c);
  const e=new PencilEngine(c,{pageWidth:1024,pageHeight:1024,paper:'medium',userId:'gallery',watercolorModel:'m70-r2-v1',watercolorReview:true,asyncFinish:false,materialPresentation:false,joinedTouch:false});
  const idle=async()=>{const start=performance.now();while(e._settle||e._opQueue.length||e._pendingRebuilds.size||e._rebuildJobs.size||e._wcCanonical.pending||e._puddle?.state.pending||!e._paper.loaded){if(performance.now()-start>300000)throw Error('Gallery idle timeout');await new Promise(r=>setTimeout(r,8))}};
  try{await e.paperReady();const transformed=ops.filter(o=>o.type!=='image_import'&&(o.type!=='stroke'||o.timestamp>=Date.UTC(2026,9,6))).map(o=>{if(o.type!=='stroke')return o;const dabs=strokeDabs(o).map(d=>({...d,x:d.x-origin[0],y:d.y-origin[1]}));return{...o,dabs:undefined,dabsPacked:packDabs(dabs),preset:o.tool==='watercolor'?o.preset.replace(/:wc@[^:]+$/,'')+':wc@m70-r2-v1':o.preset}});
   const layers=[...new Set(transformed.filter(o=>o.type==='stroke').map(o=>o.layerId))];for(const id of layers)e.initLayer(id);const {undoneInBatch}=await import('/src/pages/Room/undoneInBatch.ts');e.setUnpaintedInBatch(undoneInBatch(transformed));const started=performance.now();for(const o of transformed){e.appendOperation(o,'remote');await new Promise(r=>setTimeout(r,20))}e.setUnpaintedInBatch(null);await idle();e.watercolorDryAll();await idle();e.setCompositeOrder(layers.map(id=>({id,opacity:1})));const blob=await e.exportPNG(false);const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));const ext=e.gl.getExtension('WEBGL_debug_renderer_info');return{png:btoa(text),scale:1,origin,rect,model:e._watercolorModel,renderer:ext?e.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'',gl:e.gl.getError(),lost:e.gl.isContextLost(),elapsedMs:performance.now()-started,ops:transformed.length,state:e._puddle?.state};
  }finally{e.destroy();c.remove()}
 },{ops:item.ops,origin:item.origin,rect:item.rect});
 if(result.gl||result.lost||errors.length||!/AMD/.test(result.renderer))throw Error(JSON.stringify({...result,png:undefined,errors}));
 fs.writeFileSync(path.join(work,'output',key+'.png'),Buffer.from(result.png,'base64'));delete result.png;result.inputSha=item.inputSha;result.errors=[...errors];fs.writeFileSync(path.join(work,'output',key+'.json'),JSON.stringify(result,null,2));console.log('DONE',key,result.elapsedMs);
 }
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});

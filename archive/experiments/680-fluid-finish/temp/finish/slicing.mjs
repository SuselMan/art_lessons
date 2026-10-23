import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const {chromium}=createRequire(process.cwd()+'/package.json')('playwright')
const out=process.argv[2]??'temp/water-origin/gpu'
mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']})
const report=[]
let stage='launched'
const closeOwn=async()=>{
 const children=readFileSync('/proc/'+process.pid+'/task/'+process.pid+'/children','utf8').trim().split(/\s+/).filter(Boolean)
 await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))])
 for(const child of children){try{const pid=Number(child),comm=readFileSync('/proc/'+pid+'/comm','utf8').trim(),line=execFileSync('ps',['-p',child,'-o','ppid=,pgid='],{encoding:'utf8'}).trim().split(/\s+/).map(Number);if(comm==='chrome'&&line[0]===process.pid&&line[1]===pid)process.kill(-pid,'SIGKILL')}catch{}}
}
const wall=setTimeout(()=>{writeFileSync(out+'/wall-timeout.json',JSON.stringify({stage,at:new Date().toISOString()}));void closeOwn()},90000)
try {
 for (const test of JSON.parse(readFileSync(process.argv[3]))) { const variant=test.name
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:900,height:650}});page.on('console',m=>{if(m.text().startsWith('FINISHQA')){stage=m.text();console.log(stage)}});stage='goto-'+variant
  await page.goto('https://localhost:5300/create')
  const result=await page.evaluate(async test=>{ const variant=test.name;
   console.log('FINISHQA import');const {PencilEngine}=await import('/src/engine/index.ts')
   const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;document.body.append(canvas)
   const e=new PencilEngine(canvas,{pageWidth:2000,pageHeight:1200,paper:'medium',userId:'origin-proof'})
   console.log('FINISHQA engine-created');await e.paperReady();console.log('FINISHQA paper-ready');const info=e.gl.getExtension('WEBGL_debug_renderer_info');const renderer=info?e.gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unknown';console.log('FINISHQA renderer '+renderer);
   if(test.fixedSeed){const painter=e._ribbonPainter,paint=painter.paint.bind(painter);painter.paint=function*(...args){args[9]=test.fixedSeed;yield*paint(...args)}}
   const diagnostic=e._ribbonPainter;diagnostic.diagnosticPigmentFluidDose=test.fluidDose??false;diagnostic.diagnosticSegmentDelivery=test.mode??false;diagnostic.diagnosticPigmentRecord=test.record??true;diagnostic.diagnosticSharedFluid=test.fluid??true;diagnostic.diagnosticLandingReservoir=test.landing??true;diagnostic.diagnosticSolventField=test.solvent??false;diagnostic.diagnosticLandingPolicy=test.landingPolicy??'dry';diagnostic.diagnosticWaterPolicy=test.waterPolicy??'legacy';diagnostic.diagnosticForeignSolvent=test.foreign??false;
for(const layer of new Set(test.ops.map(o=>o.layerId)))e.initLayer(layer);e.setCompositeOrder([...new Set(test.ops.map(o=>o.layerId))].map(id=>({id,opacity:1})))
   const dabs=Array.from({length:41},(_,i)=>({x:150+i*5,y:260,pressure:.7,tiltX:0,tiltY:0,size:32,aspectRatio:1,angle:0,opacity:1,t:i*20}))
   const pigment={id:'same-pigment',strokeId:'same-pigment',seq:2,type:'stroke',tool:'watercolor',preset:variant==='pure-water'?'normal:100:0:PB29:round':'normal:100:100:PB29:round',color:[.22,0,.6],userId:'origin-proof',layerId:'paint',washId:'same-water',timestamp:1000001000,dabs,wet:(variant==='empty-dry-tag'||variant==='pure-water'?'0':'f').repeat(dabs.length)}
   const idle=async()=>{const t=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(performance.now()-t>120000||e.gl.isContextLost())throw Error('Origin idle timeout/context lost');await new Promise(r=>setTimeout(r,16))}}
   const generatedWet=[];const owned=[];const snapshots=new Map();let saved
   const passes=e._ribbonPasses,draw=passes.drawRibbonCompositeDab.bind(passes)
   passes.drawRibbonCompositeDab=(...args)=>{
    const r=draw(...args)
    if(false&&args[4].normalizeDeposit&&args[7]) {
     saved=[...args];saved[1]={...args[1]};saved[4]={...args[4]}
     for(const index of [5,6,7,8]) {
      const source=args[index];if(!source){saved[index]=null;continue}
      let snapshot=snapshots.get(index)
      if(!snapshot||snapshot.width!==source.width||snapshot.height!==source.height){snapshot=e._ribbonScratchPool.acquire(source.width,source.height);snapshots.set(index,snapshot);owned.push(snapshot)}
      source.copyTo(snapshot);saved[index]=snapshot
     }
    }
    return r
   }
   const read=buf=>{const gl=e.gl,old=gl.getParameter(gl.FRAMEBUFFER_BINDING);gl.bindFramebuffer(gl.FRAMEBUFFER,buf.fbo);const a=new Uint8Array(buf.width*buf.height*4);gl.readPixels(0,0,buf.width,buf.height,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,old);return a}
   const encode=a=>{let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s)}
   const stats=a=>{const sums=[0,0,0,0],max=[0,0,0,0];let nonzero=0,saturated=0;for(let i=0;i<a.length;i+=4){for(let c=0;c<4;c++){sums[c]+=a[i+c];max[c]=Math.max(max[c],a[i+c]);}if(a[i+3])nonzero++;if(a[i+3]===255)saturated++;}return{sums,max,nonzero,saturated}};const deposition={};const sourceHashes=[];const ctxTrace=[];let finishAt=0;
   const finish=e._finishRibbonStroke.bind(e);
   e._finishRibbonStroke=(scratch,...args)=>{if(test.captureRaster){let tileAt=0;for(const [target,tile]of scratch._tiles){for(const name of ['coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad']){const b=tile[name];if(b){const key='finish'+finishAt+'-tile'+tileAt+'-'+name,bytes=read(b);deposition[key]={w:b.width,h:b.height,...stats(bytes)};sourceHashes.push(crypto.subtle.digest('SHA-256',bytes).then(hash=>deposition[key].sha256=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')));}}tileAt++;}finishAt++;}const old=scratch._finish;if(old)ctxTrace.push({hazard:scratch.pigmentHazard,pigmentUsed:scratch.pigmentUsed,original:{landedWet:old.landedWet,wetPeak:old.wetPeak},override:test.ctxWet??null});if(old&&test.ctxWet!==undefined)scratch._finish={...old,landedWet:test.ctxWet,wetPeak:test.ctxWet};try{return finish(scratch,...args)}finally{scratch._finish=old}};
   try {
    if(test.samplePrior){const feed=e._wetFromForeignStroke.bind(e);e._wetFromForeignStroke=(layer,tool,preset,dabs,at,standing)=>feed(layer,tool,preset,dabs,null,standing)}
    if(test.liveBatches){
      const {RibbonStrokeScratch}=await import('/src/engine/src/buffers/RibbonStrokeScratch.ts');
      const op=test.ops[0],target=e._layers.get(op.layerId),scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true);
      scratch.beginStroke();let at=0,prev;
      for(const count of test.liveBatches){const part=op.dabs.slice(at,at+count);if(!part.length)continue;
        e._paintRibbonDabs(target,part,op.tool,op.preset,op.color,scratch,prev,op.strokeId,op.washId,op.wet?.slice(at,at+part.length),test.fixedSeed??[1,2],false);
        prev=part.at(-1);at+=part.length;
      }
      if(at!==op.dabs.length)throw Error('Batches do not cover gesture');
      e._finishRibbonStroke(scratch,false,false,false);await idle();scratch.destroy();
    } else for(const source of test.ops){let op=source;if(test.samplePrior&&Number(source.preset.split(':')[2])>0){const {quantizeWet}=await import('/src/engine/src/paper/paperWetness.ts');const mul=e._resolvePreset(source.tool,source.preset).sizeMultiplier;op={...source,wet:source.dabs.map(d=>quantizeWet(e._paperWet.sampleUnderNib(source.layerId,d.x,d.y,d.size*.5*mul*Math.max(d.aspectRatio,1),performance.now()))).join('')};}generatedWet.push({id:op.id,preset:op.preset,wet:op.wet});console.log('FINISHQA append '+op.id);e.appendOperation(op,'remote');await idle();console.log('FINISHQA idle '+op.id)} console.log('FINISHQA dry');e.watercolorDryAll();await idle();console.log('FINISHQA dry-idle')
    passes.drawRibbonCompositeDab=draw

    const fields={...deposition};for(const [i,name]of [])if(saved?.[i])fields[name]={w:saved[i].width,h:saved[i].height,...stats(read(saved[i]))}
    const png=encode(new Uint8Array(await(await e.exportPNG(false)).arrayBuffer()))
    const counter=[]
    if(false) {
     const unchanged=read(saved[7]);const counterLoad=e._ribbonScratchPool.acquire(saved[7].width,saved[7].height);owned.push(counterLoad)
     for(const tag of [0,1]) {
      const data=new Uint8Array(unchanged);for(let i=0;i<data.length;i+=4)data[i+1]=tag?data[i+3]:0
      const gl=e.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,counterLoad.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,counterLoad.width,counterLoad.height,gl.RGBA,gl.UNSIGNED_BYTE,data)
      const args=[...saved];args[7]=counterLoad;draw(...args)
      counter.push({tag,png:encode(new Uint8Array(await(await e.exportPNG(false)).arrayBuffer()))})
     }
    }
    console.log('FINISHQA sha');await Promise.all(sourceHashes);console.log('FINISHQA done');return {renderer,ctxTrace,png,fields,counter,gl:e.gl.getError(),lost:e.gl.isContextLost(),draws:41,trace:diagnostic.diagnosticTrace,generatedWet}
   }finally{passes.drawRibbonCompositeDab=draw;for(const buf of owned)e._ribbonScratchPool.release(buf);e.destroy()}
  },test)
  for(const [key,field]of Object.entries(result.fields)){if(field.bytes){field.sha256=createHash('sha256').update(Buffer.from(field.bytes,'base64')).digest('hex');delete field.bytes}}
  writeFileSync(out+'/'+variant+'.png',Buffer.from(result.png,'base64'));delete result.png
  for(const counter of result.counter){writeFileSync(out+'/'+variant+'-counter'+counter.tag+'.png',Buffer.from(counter.png,'base64'));delete counter.png}
  report.push({variant,...result});writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({variant,gl:result.gl,lost:result.lost}))
  await page.close()
 }
}finally{clearTimeout(wall);await closeOwn()}

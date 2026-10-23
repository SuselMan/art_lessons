import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const {chromium}=createRequire(process.cwd()+'/package.json')('playwright')
const out=process.argv[2]??'temp/water-origin/gpu'
mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']})
const report=[]
try {
 for (const test of JSON.parse(readFileSync(process.argv[3]))) { const variant=test.name
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:900,height:650}})
  await page.goto('https://localhost:5296/create')
  const result=await page.evaluate(async test=>{ const variant=test.name;
   const {PencilEngine}=await import('/src/engine/index.ts')
   const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;document.body.append(canvas)
   const e=new PencilEngine(canvas,{pageWidth:2000,pageHeight:1200,paper:'medium',userId:'origin-proof'})
   await e.paperReady();
   const diagnostic=e._ribbonPainter;diagnostic.diagnosticSegmentDelivery=test.mode??false;diagnostic.diagnosticPigmentRecord=test.record??true;diagnostic.diagnosticSharedFluid=test.fluid??true;diagnostic.diagnosticLandingReservoir=test.landing??true;diagnostic.diagnosticSolventField=test.solvent??false;diagnostic.diagnosticLandingPolicy=test.landingPolicy??'dry';
for(const layer of new Set(test.ops.map(o=>o.layerId)))e.initLayer(layer);e.setCompositeOrder([...new Set(test.ops.map(o=>o.layerId))].map(id=>({id,opacity:1})))
   const dabs=Array.from({length:41},(_,i)=>({x:150+i*5,y:260,pressure:.7,tiltX:0,tiltY:0,size:32,aspectRatio:1,angle:0,opacity:1,t:i*20}))
   const pigment={id:'same-pigment',strokeId:'same-pigment',seq:2,type:'stroke',tool:'watercolor',preset:variant==='pure-water'?'normal:100:0:PB29:round':'normal:100:100:PB29:round',color:[.22,0,.6],userId:'origin-proof',layerId:'paint',washId:'same-water',timestamp:1000001000,dabs,wet:(variant==='empty-dry-tag'||variant==='pure-water'?'0':'f').repeat(dabs.length)}
   const idle=async()=>{const t=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(performance.now()-t>120000||e.gl.isContextLost())throw Error('Origin idle timeout/context lost');await new Promise(r=>setTimeout(r,16))}}
   const owned=[];const snapshots=new Map();let saved
   const passes=e._ribbonPasses,draw=passes.drawRibbonCompositeDab.bind(passes)
   passes.drawRibbonCompositeDab=(...args)=>{
    const r=draw(...args)
    if(args[4].normalizeDeposit&&args[7]) {
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
   const deposition={};let finishAt=0;
   const finish=e._finishRibbonStroke.bind(e);
   e._finishRibbonStroke=(scratch,...args)=>{if(test.captureRaster){let tileAt=0;for(const [target,tile] of scratch._tiles){deposition['finish'+finishAt+'-tile'+tileAt+'-appearance']={w:target.width,h:target.height,data:encode(read(target))};for(const name of ['coverage','inkLoad','inkColor','inkBase','strokeInk','colorBase','strokeColor','solventLoad','solventBase','strokeSolvent']){const b=tile[name];if(b)deposition['finish'+finishAt+'-tile'+tileAt+'-'+name]={w:b.width,h:b.height,data:encode(read(b))};}tileAt++;}finishAt++;}return finish(scratch,...args)};
   try {
    if(test.samplePrior){const feed=e._wetFromForeignStroke.bind(e);e._wetFromForeignStroke=(layer,tool,preset,dabs,at,standing)=>feed(layer,tool,preset,dabs,null,standing)}
    for(const source of test.ops){let op=source;if(test.samplePrior&&Number(source.preset.split(':')[2])>0){const {quantizeWet}=await import('/src/engine/src/paper/paperWetness.ts');const mul=e._resolvePreset(source.tool,source.preset).sizeMultiplier;op={...source,wet:source.dabs.map(d=>quantizeWet(e._paperWet.sampleUnderNib(source.layerId,d.x,d.y,d.size*.5*mul*Math.max(d.aspectRatio,1),performance.now()))).join('')};}e.appendOperation(op,'remote');await idle()} e.watercolorDryAll();await idle()
    passes.drawRibbonCompositeDab=draw
    if(!saved)throw Error('No final composite captured')
    const fields={...deposition};for(const [i,name]of [[6,'coverage'],[7,'deposit'],[8,'colour']])if(saved[i])fields[name]={w:saved[i].width,h:saved[i].height,data:encode(read(saved[i]))}
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
    return {png,fields,counter,gl:e.gl.getError(),lost:e.gl.isContextLost(),draws:41,trace:diagnostic.diagnosticTrace}
   }finally{passes.drawRibbonCompositeDab=draw;for(const buf of owned)e._ribbonScratchPool.release(buf);e.destroy()}
  },test)
  writeFileSync(out+'/'+variant+'.png',Buffer.from(result.png,'base64'));delete result.png
  for(const [name,snap]of Object.entries(result.fields)){const data=Buffer.from(snap.data,'base64');writeFileSync(out+'/'+variant+'-'+name+'.rgba',data);snap.sha=createHash('sha256').update(data).digest('hex');delete snap.data}
  for(const counter of result.counter){writeFileSync(out+'/'+variant+'-counter'+counter.tag+'.png',Buffer.from(counter.png,'base64'));delete counter.png}
  report.push({variant,...result});writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({variant,gl:result.gl,lost:result.lost}))
  await page.close()
 }
}finally{await browser.close()}

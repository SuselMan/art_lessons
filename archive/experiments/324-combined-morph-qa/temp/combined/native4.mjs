import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
const { chromium }=createRequire(process.cwd()+'/package.json')('playwright');
const out='temp/combined/native4';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true});const uiErrors=[];page.on('pageerror',e=>uiErrors.push(String(e)));
 await page.goto('https://localhost:5301/create?qa=combined-native4');await page.waitForTimeout(1500);await page.locator('input[type="text"]').first().fill('combined5301-native-review');await page.getByRole('button',{name:/Create project|Создать проект/}).click();await page.waitForURL(/\/room\/[^/]+$/);await page.waitForFunction(()=>!!window.__engine,undefined,{timeout:60000});const ui=await page.evaluate(()=>{const e=window.__engine,d=e._ribbonPainter;const r={room:location.pathname,mode:d.diagnosticSegmentDelivery,record:d.diagnosticPigmentRecord,fluid:d.diagnosticSharedFluid,solvent:d.diagnosticSolventField,foreign:d.diagnosticForeignSolvent,radius:d.diagnosticCanonicalSettleRadius,gl:e.gl.getError(),lost:e.gl.isContextLost()};e.destroy();return r});await page.screenshot({path:out+'/room-ui.png'});
 const r=await page.evaluate(async()=>{
  const {PencilEngine}=await import('/src/engine/index.ts');const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;document.body.append(canvas);
  const e=new PencilEngine(canvas,{pageWidth:2000,pageHeight:1200,paper:'medium',userId:'combined-native-proof'});await e.paperReady();e.initLayer('native');e.setActiveLayer('native');e.setCompositeOrder([{id:'native',opacity:1}]);e.setTool('watercolor');e.setSize(40);e.setColor([.22,0,.6]);
  const d=e._ribbonPainter,flags={mode:d.diagnosticSegmentDelivery,record:d.diagnosticPigmentRecord,fluid:d.diagnosticSharedFluid,solvent:d.diagnosticSolventField,foreign:d.diagnosticForeignSolvent,radius:d.diagnosticCanonicalSettleRadius,landing:d.diagnosticLandingPolicy,waterPolicy:d.diagnosticWaterPolicy};
  if(flags.mode!=='combined'||!flags.solvent||!flags.radius||flags.waterPolicy!=='bottomless')throw Error('Combined DEV flags disabled: '+JSON.stringify(flags));
  let phase='native';const captures=[],digests=[],errors=[];const check=name=>errors.push({phase:name,error:e.gl.getError()});
  const finish=e._finishRibbonStroke.bind(e);e._finishRibbonStroke=(scratch,...args)=>{
   for(const [tile,t]of scratch._tiles){const row={phase,args,tile:{x:tile.x,y:tile.y},radius:scratch.finishContext?.radiusPx,travel:scratch.brushTravel.length,fields:{}};captures.push(row);
    for(const name of ['coverage','inkLoad','inkColor','solventLoad','strokeInk','strokeColor','strokeSolvent']){const buffer=t[name];if(!buffer)continue;const width=Math.min(256,buffer.width-64),height=Math.min(128,buffer.height-96),a=new Uint8Array(width*height*4);e.gl.bindFramebuffer(e.gl.FRAMEBUFFER,buffer.fbo);e.gl.readPixels(64,buffer.height-96-height,width,height,e.gl.RGBA,e.gl.UNSIGNED_BYTE,a);digests.push(crypto.subtle.digest('SHA-256',a).then(hash=>{row.fields[name]=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}));}
   }return finish(scratch,...args)
  };
  const idle=async()=>{const start=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(performance.now()-start>60000)throw Error('idle timeout '+phase);await new Promise(r=>setTimeout(r,16))}};
  const encode=async()=>{const a=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer());let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s)};
  const stroke=async(preset,y)=>{e.setPencil(preset);const sample=i=>({x:100+i*12,y,pressure:.7,tiltX:0,tiltY:0,speed:.5,pointerType:'pen',timeStamp:performance.now()});e._onStart(sample(0));for(let i=1;i<=15;i++){e._onMove(sample(i));await new Promise(r=>requestAnimationFrame(r))}e._onEnd(sample(15));await idle();check('stroke-'+preset+'-'+y)};
  check('ready');await stroke('normal:100:15:PB29:round',150);await stroke('normal:100:0:PB29:round',350);await stroke('normal:0:100:PB29:round',350);await stroke('normal:100:15:PB29:chisel',550);
  e.watercolorDryAll();await idle();check('dry');const before=await encode(),ops=e.getOperations();check('before-export');
  phase='undo';const undo=e.undo();await idle();check('undo');phase='redo';const redoOK=e.redo();await idle();e.watercolorDryAll();await idle();const redo=await encode();check('redo-export');
  phase='rebuild';e._rebuildLayer('native');await idle();e.watercolorDryAll();await idle();const rebuild=await encode();check('rebuild-export');await Promise.all(digests);
  const result={flags,ops,captures,errors,undo,redoOK,before,redo,rebuild,gl:e.gl.getError(),lost:e.gl.isContextLost()};e.destroy();return result;
 });
 for(const k of ['before','redo','rebuild']){writeFileSync(out+'/'+k+'.png',Buffer.from(r[k],'base64'));delete r[k]}
 async function diff(a,b){const x=await sharp(out+'/'+a+'.png').ensureAlpha().raw().toBuffer(),y=await sharp(out+'/'+b+'.png').ensureAlpha().raw().toBuffer();let pixels=0,max=0,sum=0;for(let i=0;i<x.length;i+=4){let changed=false;for(let j=0;j<4;j++){const v=Math.abs(x[i+j]-y[i+j]);sum+=v;max=Math.max(max,v);changed||=v>0}pixels+=Number(changed)}return{pixels,max,mean:sum/x.length}}
 r.diff={nativeRedo:await diff('before','redo'),nativeRebuild:await diff('before','rebuild'),redoRebuild:await diff('redo','rebuild')};r.ui=ui;r.uiErrors=uiErrors;writeFileSync(out+'/report.json',JSON.stringify(r,null,2));console.log({flags:r.flags,diff:r.diff,gl:r.gl,lost:r.lost,errors:r.errors,captures:r.captures.map(c=>({phase:c.phase,radius:c.radius,fields:c.fields})),uiErrors});
}finally{await browser.close()}

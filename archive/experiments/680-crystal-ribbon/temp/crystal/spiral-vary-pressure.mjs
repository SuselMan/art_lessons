import {chromium} from 'playwright';
import fs from 'node:fs';import crypto from 'node:crypto';
const root='temp/crystal-mirror',out=root+'/spiral-vary-results';fs.mkdirSync(out,{recursive:true});
const ops=JSON.parse(fs.readFileSync('temp/KJc0OoVo/ops.json')).filter(o=>o.seq>=45&&o.seq<=47);
const report={base:'f5397918',candidate:'fac23cd7',scope:'Fresh engines, immutable recorded seq45–47; pressure versus transport controls',cases:[]};
const save=()=>fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));let browser;
const wall=setTimeout(()=>{report.timeout=true;save();void browser?.close().finally(()=>process.exit(124));},300000);
try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'},args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 for(const arm of ['pressure']){
  const src=root+'/markerRibbon-'+(arm.startsWith('pressure')?'candidate':'baseline')+'.ts';fs.copyFileSync(src,root+'/src/engine/src/dabs/markerRibbon.ts');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');await new Promise(r=>setTimeout(r,5000));
  const context=await browser.newContext({viewport:{width:900,height:650}});const page=await context.newPage();page.on('pageerror',e=>{(report.errors??=[]).push(String(e));save()});
  try{await page.goto('http://127.0.0.1:5317/');
   const data=await page.evaluate(async({ops,arm})=>{
    const {PencilEngine}=await import('/src/engine/index.ts');const canvas=document.createElement('canvas');canvas.width=900;canvas.height=650;document.body.append(canvas);
    const e=new PencilEngine(canvas,{pageWidth:1754,pageHeight:2480,paper:'fine'});e.setBaseLayers(['layer-1']);e.setActiveLayer('layer-1');e.setCompositeOrder([{id:'layer-1',opacity:1}]);await e.paperReady();e.setWatercolorAb({noSpread:false,noMigrate:false,noCarry:arm.endsWith('noCarry'),noDiffuse:arm.endsWith('noDiffuse')});
    const records=[];try{e.setTool('watercolor');e.setPencil('normal:100:100:PB29:round');e.setSize(80);e.setColor([.45,.21,.73]);
     const event=(i)=>{const theta=i/180*Math.PI*8,r=180-140*i/180;return{x:700+Math.cos(theta)*r,y:700+Math.sin(theta)*r,pressure:.5+.28*Math.sin(i/180*Math.PI*32),tiltX:0,tiltY:0,speed:.8,pointerType:'pen',timeStamp:10000+i*12}};
     e._onStart(event(0));for(let i=1;i<=180;i++){e._onMove(event(i));if(i%4===0)await new Promise(requestAnimationFrame)}e._onEnd(event(181));
     const start=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(performance.now()-start>40000)throw Error('idle timeout');await new Promise(requestAnimationFrame)}
     const blob=await e.exportPNG(false);if(!blob)throw Error('missing export');let bin='';for(const b of new Uint8Array(await blob.arrayBuffer()))bin+=String.fromCharCode(b);records.push({seq:1,png:btoa(bin),gl:e.gl.getError(),lost:e.gl.isContextLost(),ops:e.getOperations().map(o=>({type:o.type,preset:o.preset,dabsPacked:!!o.dabsPacked}))});
     return {records,gpu:e.gpuInfo(),width:canvas.width,height:canvas.height};
    }finally{e.destroy();canvas.remove()}
   },{ops,arm});
   for(const r of data.records){fs.writeFileSync(out+'/'+arm+'-'+r.seq+'.png',Buffer.from(r.png,'base64'));delete r.png;if(r.gl||r.lost)throw Error('bad GL');}
   report.cases.push({arm,hash,...data});save();console.log('DONE',arm);
  }finally{await context.close();}
 }
}catch(e){report.error=String(e);save();throw e}finally{clearTimeout(wall);await browser?.close();fs.copyFileSync(root+'/markerRibbon-baseline.ts',root+'/src/engine/src/dabs/markerRibbon.ts');report.ownedChromeClosed=true;save();}

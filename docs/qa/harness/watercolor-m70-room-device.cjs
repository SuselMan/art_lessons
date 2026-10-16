// Real-GPU, disposable-room probe. QA_CDP, QA_ENTRY_URL, QA_ROOM, QA_OUTPUT required.
// This clears the active layer of its explicitly provided disposable fixture.
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const {QA_CDP,QA_ENTRY_URL,QA_ROOM,QA_OUTPUT,QA_HOST_STATE}=process.env;
if(!QA_CDP||!QA_ENTRY_URL||!QA_ROOM||!QA_OUTPUT)throw Error('Missing QA fixture arguments');
fs.mkdirSync(QA_OUTPUT,{recursive:true});
(async()=>{
  const browser=await chromium.connectOverCDP(QA_CDP);
  let context,page;
  try{
    context=await browser.newContext({...(QA_HOST_STATE?{storageState:QA_HOST_STATE}:{}),viewport:{width:1280,height:800}});
    page=await context.newPage();await page.bringToFront();page.setDefaultTimeout(120000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(QA_ENTRY_URL,{waitUntil:'domcontentloaded'});
    await page.goto(new URL('/room/'+QA_ROOM+'?qaModel=m70-r2-v1',QA_ENTRY_URL).href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));
    if(await page.locator('form input[type="text"]').count()){
      await page.locator('form input[type="text"]').first().fill('M70 device QA');
      await page.locator('form button[type="submit"]').click();
    }
    await page.waitForFunction(()=>window.__engine&&!__engine._locked&&__engine._paper.loaded&&!__engine._pendingRebuilds.size&&!__engine._rebuildJobs.size&&!__engine._puddle?.state.pending&&__engine._opts.tool==='watercolor'&&__engine._opts.pencilType==='normal:95:34:PB29:round');
    await page.evaluate(()=>__engine.clear());
    await page.waitForFunction(()=>!__engine._locked&&!__engine._pendingRebuilds.size&&!__engine._rebuildJobs.size&&!__engine._puddle?.state.pending&&__engine._opts.tool==='watercolor'&&__engine._opts.pencilType==='normal:95:34:PB29:round');
    const result=await page.evaluate(async()=>{
      const e=__engine,raf=()=>new Promise(requestAnimationFrame),ext=e.gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=ext?e.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;
      if(!renderer||/swiftshader|llvmpipe/i.test(renderer))throw Error('Real GPU required: '+renderer);
      const startOperations=e.getOperations().filter(o=>o.type==='stroke').length;
      e.setSize(210);
      const costs=[],strokeIds=[];
      let time=1000;
      const ev=(x,y)=>({x,y,pressure:.7,tiltX:0,tiltY:0,speed:1,pointerType:'pen',timeStamp:time+=16});
      for(let j=0;j<8;j++){
        const at=performance.now();e._onStart(ev(240+j*45,250));
        if(e._dwellTimer){clearInterval(e._dwellTimer);e._dwellTimer=null}
        if(!e._strokeId)throw Error('DOWN refused '+JSON.stringify({destroyed:e._destroyed,locked:e._locked,tool:e._opts.tool,preset:e._opts.pencilType,puddle:e._puddle?.state}));
        costs.push(performance.now()-at);strokeIds.push(e._strokeId);
        for(let i=1;i<=5;i++){await raf();e._onMove(ev(240+j*45,250+i*60))}
        e._onEnd(ev(240+j*45,550));
        if(j===0)for(let i=0;i<8;i++)await raf();
      }
      return{strokeIds,renderer,model:e._watercolorModel,preset:e._strokePreset,costs,startOperations,beforeDry:e._puddle.state,gl:e.gl.getError()};
    });
    const dryAt=Date.now();await page.getByRole('button',{name:/dry everything|высушить всё/i}).click();
    await page.waitForFunction(()=>!__engine._puddle?.state.pending&&!__engine._opQueue.length);
    result.dryWallMs=Date.now()-dryAt;
    result.after=await page.evaluate(ids=>({state:__engine._puddle.state,strokes:__engine.getOperations().filter(o=>o.type==='stroke').length,newStrokes:new Set(__engine.getOperations().filter(o=>o.type==='stroke'&&ids.includes(o.strokeId)).map(o=>o.strokeId)).size,gl:__engine.gl.getError()}),result.strokeIds);
    await page.screenshot({path:QA_OUTPUT+'/many-dry.png'});
    await page.evaluate(()=>{const e=__engine;window.__qaCamera={...e._camera.state};e.setViewport(512,512,.35,0);e._display()});
    await page.screenshot({path:QA_OUTPUT+'/zoom.png'});
    await page.evaluate(()=>__engine.clear());
    result.cleared=await page.evaluate(()=>({layers:__engine._puddle.state.layers,resident:__engine._layers.get(__engine._activeId).allResident().length,gl:__engine.gl.getError()}));
    result.errors=errors;
    fs.writeFileSync(QA_OUTPUT+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
    if(errors.length||result.gl||result.after.gl||result.cleared.gl||result.cleared.layers||result.after.newStrokes!==8||result.after.state.computations>3)throw Error('M70 probe failed');
  }finally{if(page)await page.close();if(context)await context.close();await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

const fs=require('fs'),crypto=require('crypto'),{chromium}=require('@playwright/test');
const out=__dirname+'/samsung-room-detail';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:19223');let p;try{
 p=await b.contexts()[0].newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(JSON.parse(fs.readFileSync('/home/suselman/.local/share/project-services/gl1-review/integration-entry.json')).url);
 await p.goto('https://tools.pecni.com/create?qaFastDry=detail');await p.locator('form input[type="text"]').first().fill('Samsung detail smoke');await p.getByText('Fine',{exact:true}).click();await p.getByText('Custom',{exact:true}).click();const dims=p.locator('form input[type="number"]');await dims.nth(0).fill('1024');await dims.nth(1).fill('1024');await p.locator('form button[type="submit"]').press('Enter');
 await p.waitForFunction(()=>window.__engine&&!__engine._locked,null,{timeout:90000});await p.evaluate(()=>__engine.paperReady());
 const identity=await p.evaluate(()=>({model:__engine._watercolorModel,renderer:__engine.gl.getParameter(__engine.gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),room:location.pathname}));if(identity.model!=='front8-detail-v1')throw Error('Wrong model '+JSON.stringify(identity));console.log('READY',identity.model);
 await p.evaluate(()=>{const s=__roomStore.getState();s.setTool('watercolor');for(const[k,v]of Object.entries({size:380,water:1,pigment:.69,pressureResponse:'normal',nib:'round'}))s.setToolSetting('watercolor',k,v)});
 await p.waitForFunction(()=>__engine._opts.tool==='watercolor');
 const idle=async()=>{await p.waitForFunction(()=>{const e=__engine;if(e._wcAsyncError)throw e._wcAsyncError;return !e._locked&&!e._settle&&!e._wcCanonical.pending&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size},null,{timeout:180000});await p.evaluate(()=>{const e=__engine;e._layers.get(e._activeId).allResident()[0]?.buffer.readPixelsRegion(0,0,1,1);e._sweepReveals(performance.now()+100000);e._display()})};
 const read=async()=>{const a=await p.evaluate(()=>__engine._layers.get(__engine._activeId).allResident().map(t=>{const v=t.buffer.readPixels();let s='';for(let i=0;i<v.length;i+=8192)s+=String.fromCharCode(...v.subarray(i,i+8192));return{x:t.originX,y:t.originY,v:btoa(s)}}));return a.map(t=>({x:t.x,y:t.y,hash:crypto.createHash('sha256').update(Buffer.from(t.v,'base64')).digest('hex')})).sort((a,b)=>a.y-b.y||a.x-b.x)};
 for(let j=0;j<2;j++){await p.evaluate(j=>{__engine.setColor(j?[.97,.82,.03]:[.05,.32,.73]);const at=i=>({x:120+760*i/16,y:j?820-620*i/16:170+100*Math.sin(i/16*Math.PI),pressure:.85,tiltX:0,tiltY:0,speed:.5,pointerType:'pen',timeStamp:1000+j*500+i*12});__engine._onStart(at(0));for(let i=1;i<=16;i++)__engine._onMove(at(i));__engine._onEnd(at(16))},j)}
 await p.getByRole('button',{name:/dry everything|высушить всё/i}).click();console.log('DRY');await idle();const baseline=await read();const report={identity,baseline,errors,ops:await p.evaluate(()=>__engine.getOperations().filter(o=>o.type==='stroke').map(o=>({preset:o.preset,id:o.id})))};
 if(report.ops.length!==2||report.ops.some(o=>!o.preset.endsWith(':wc@front8-detail-v1')))throw Error('Invalid strokes/version');
 await p.screenshot({path:out+'/painted.png'});
 await p.evaluate(()=>__engine.undo());await idle();report.undo=await read();if(JSON.stringify(report.undo)===JSON.stringify(baseline))throw Error('Undo did not change pixels');
 await p.evaluate(()=>__engine.redo());await idle();report.redo=await read();console.log('REDO',JSON.stringify(report.redo)===JSON.stringify(baseline));
 await p.reload();await p.waitForFunction(()=>window.__engine||document.querySelector('form input[type="text"]'),null,{timeout:90000});if(await p.locator('form input[type="text"]').count()){await p.locator('form input[type="text"]').first().fill('QA Samsung');await p.locator('form button[type="submit"]').press('Enter')}await p.waitForFunction(()=>window.__engine&&!__engine._locked,null,{timeout:90000});await p.evaluate(()=>__engine.paperReady());await idle();report.reenter=await read();
 report.export=await p.evaluate(async()=>{const i=await __engine.exportPNG();return{bytes:i?.size,type:i?.type}});
 report.gl=await p.evaluate(()=>__engine.gl.getError());report.lost=await p.evaluate(()=>__engine.gl.isContextLost());
 report.redoExact=JSON.stringify(report.redo)===JSON.stringify(baseline);report.reenterExact=JSON.stringify(report.reenter)===JSON.stringify(baseline);
 fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('DONE',report.redoExact,report.reenterExact,report.gl,report.export);
 if(!report.redoExact||!report.reenterExact||report.gl||report.lost||errors.length||!report.export.bytes)throw Error('Room smoke failed; report saved');
}finally{if(p)await p.close().catch(()=>{});await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});

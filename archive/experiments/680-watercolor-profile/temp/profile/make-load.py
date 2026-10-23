s=open('temp/profile/queue-controller.mjs').read().replace("const out='temp/profile-current/queue-results'","const out='temp/profile-current/load-results'")
a=s.index('const result=await page.evaluate(spec=>');b=s.index('  }finally{',a)
s=s[:a]+'''
   await page.exposeFunction('__loadProgress',value=>{report.progress??=[];report.progress.push(value);save();console.log(JSON.stringify(value))});
   const input=JSON.parse(readFileSync('temp/profile-current/room-ops.json'));report.journalHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');save();
   const result=await page.evaluate(async input=>{const e=__engine,t=performance.now();let samples=[],final=null;const snap=()=>({elapsed:performance.now()-t,log:e._log.entries.length,pending:e._opQueue.length,settle:e._settle?{next:e._settle.next,total:e._settle.ops.length}:null,rebuild:e._rebuildJobs.size,reveals:e._washReveals.size});
    const timer=setInterval(()=>{const x=snap();samples.push(x);__loadProgress(x)},5000);
    try{for(const op of input)e.appendOperation(op,'remote');while(performance.now()-t<180000){if(!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size){final=snap();break}await new Promise(r=>setTimeout(r,100))}return{completed:!!final,elapsed:performance.now()-t,final:final??snap(),samples,gl:{error:e.gl.getError(),lost:e.gl.isContextLost()}}}finally{clearInterval(timer)}},input);
   const queueProfile=await page.evaluate(()=>__queueProbeFinish());report.queueProfile=queueProfile;report.result=result;save();
   if(result.gl.error||result.gl.lost)throw Error('Room load GL guard');
   if(result.completed){const png=await page.evaluate(async()=>{const b=await __engine.exportPNG();return await new Promise(r=>{const f=new FileReader;f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)})});writeFileSync(out+'/room.png',Buffer.from(png,'base64'));}
   console.log(JSON.stringify({completed:result.completed,elapsed:result.elapsed,jobs:queueProfile.jobs.length}));
''' + s[b:]
open('temp/profile/load-controller.mjs','w').write(s)

const{chromium}=require('@playwright/test'),fs=require('fs'),{execFileSync}=require('child_process');
(async()=>{const b=await chromium.connectOverCDP('http://localhost:19223'),p=await b.contexts()[0].newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());try{
await p.bringToFront();await p.goto('http://localhost:15385/watercolor-mini?v=68',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__miniPuddle?.state.diagnostic);
// A real trusted pointer action arms history under Chromium's activation policy.
await p.locator('#paper').click({position:{x:180,y:180}});
await p.waitForFunction(()=>__miniBackProtection.state.armed);
await p.evaluate(()=>{window.__guardEngine=__wcNative;window.__guardOrigin=performance.timeOrigin});
const before=await p.evaluate(()=>({state:__miniBackProtection.state,png:document.querySelector('#paper').toDataURL(),url:location.href,length:history.length}));
const backs=[];
for(let i=0;i<4;i++){
execFileSync('/home/suselman/tools/platform-tools/adb',['-s','192.168.1.36:38589','shell','input','keyevent','4']);
if(p.isClosed())throw Error('native Back closed test tab');
await p.waitForFunction(n=>__miniBackProtection.state.blocked>=n,i+1,{timeout:5000});
backs.push(await p.evaluate(()=>({state:__miniBackProtection.state,sameEngine:__wcNative===__guardEngine,sameDocument:performance.timeOrigin===__guardOrigin,url:location.href,length:history.length,png:document.querySelector('#paper').toDataURL()})));
}
await p.locator('#modelControls>summary').click();await p.selectOption('#version','64');await p.waitForFunction(()=>__wcReviewVersion==='mini-M64-morph'&&!document.querySelector('#version').disabled);
execFileSync('/home/suselman/tools/platform-tools/adb',['-s','192.168.1.36:38589','shell','input','keyevent','4']);
await p.waitForFunction(()=>__miniBackProtection.state.blocked>=5);
const afterSwitch=await p.evaluate(()=>({url:location.href,version:__wcReviewVersion,selection:document.querySelector('#version').value,sameEngine:__wcNative===__guardEngine}));
await p.uncheck('#protectExit');await p.waitForFunction(()=>!__miniBackProtection.state.armed);const unlocked=await p.evaluate(()=>__miniBackProtection.state);
await p.check('#protectExit');await p.waitForFunction(()=>__miniBackProtection.state.armed);
const clear=await p.evaluate(()=>__miniBackProtection.state);
const pixelsStayed=backs.every(r=>r.png===before.png);for(const r of backs)delete r.png;delete before.png;
const r={before,backs,afterSwitch,unlocked,clear,pixelsStayed,errors};
fs.writeFileSync(process.argv[2],JSON.stringify(r,null,2));console.log(JSON.stringify(r));
if(!pixelsStayed||errors.length||backs.some(x=>!x.sameEngine||!x.sameDocument||x.url!==before.url||x.length!==before.length)||!afterSwitch.url.includes('v=64')||!afterSwitch.sameEngine||unlocked.enabled||unlocked.armed)throw Error('back protection failed');
}finally{await p.close();await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});

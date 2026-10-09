/** Actual UI only; readbacks happen after the timing scenario and canonical idle. */
export async function uiWhole(page){
 return page.evaluate(async()=>{const e=window.__engine,end=performance.now()+30000;while(e._settle||e._wcCanonical.pending||e._rebuildJobs.size){if(performance.now()>end||e.gl.isContextLost())throw Error('UI canonical idle deadline');await new Promise(requestAnimationFrame)}const blob=await e.exportPNG(true);if(!blob)throw Error('UI export missing');const b=await createImageBitmap(blob),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d');ctx.drawImage(b,0,0);b.close();const rgba=ctx.getImageData(0,0,c.width,c.height).data,sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(x=>x.toString(16).padStart(2,'0')).join('');let nonwhite=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]<245||rgba[i+1]<245||rgba[i+2]<245)nonwhite++;return{sha,width:c.width,height:c.height,nonwhite,glError:e.gl.getError(),lost:e.gl.isContextLost()}});
}
export async function runMixedLeaseUiLifecycle(page){
 const before=await uiWhole(page);if(before.nonwhite<10)throw Error('Meaningful UI pigment required');
 const count=()=>page.evaluate(()=>window.__engine.getOperations().length);
 const n=await count();await page.getByRole('button',{name:/^(Отменить|Undo)$/}).click();await page.waitForFunction(n=>window.__engine.getOperations().length!==n,n,{timeout:30000});const undo=await uiWhole(page);if(undo.sha===before.sha)throw Error('Actual UI undo did not change pigment');
 const u=await count();await page.getByRole('button',{name:/^(Вернуть|Redo)$/}).click();await page.waitForFunction(n=>window.__engine.getOperations().length!==n,u,{timeout:30000});const redo=await uiWhole(page);if(redo.sha!==before.sha)throw Error('Actual UI redo whole mismatch');
 const d=await count();await page.getByRole('button',{name:/^(Высушить всё|Dry everything)$/}).click();await page.waitForFunction(n=>window.__engine.getOperations().slice(n).some(o=>o.type==='paper_dry'),d,{timeout:30000});const dry=await uiWhole(page);
 return{before,undo,redo,dry,operations:await page.evaluate(()=>window.__engine.getOperations().map(o=>({id:o.id,type:o.type,strokeId:o.strokeId,target:o.targetOpId}))),scope:'Actual buttons, dry op, whole after canonical idle. No inside timing readbacks.'};
}

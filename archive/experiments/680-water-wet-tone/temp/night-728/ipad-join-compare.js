(async()=>{
 const input=document.querySelector('form input');
 if(input){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'728 iPad QA');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,100));document.querySelector('form').requestSubmit()}
 const start=performance.now();while(!window.__engine||window.__engine.getOperations().length<2){if(performance.now()-start>20000)throw Error('restore timeout');await new Promise(r=>setTimeout(r,100))}
 const e=window.__engine,key=window.__roomStore.getState().boardId;
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('qa728load',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 const saved=await new Promise((resolve,reject)=>{const q=db.transaction('fixtures').objectStore('fixtures').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});db.close();if(!saved)throw Error('missing baseline');
 const now=e._layers.get(saved.layer).allResident();let different=0,max=0,missing=0;
 for(const a of saved.tiles){const b=now.find(t=>t.originX===a.x&&t.originY===a.y);if(!b){missing++;continue}const p=b.buffer.readPixels();if(p.length!==a.rgba.length)throw Error('geometry mismatch');for(let j=0;j<p.length;j++){const d=Math.abs(p[j]-a.rgba[j]);if(d){different++;max=Math.max(max,d)}}}
 return {room:key,different,max,missing,tiles:now.length,savedTiles:saved.tiles.length,ops:e.getOperations().map(o=>o.type),coverage:[...e._snapshotIO.ctx.ledger.coverage.entries()],lost:e.gl.isContextLost(),joinToComparisonMs:performance.now()-start};
})()
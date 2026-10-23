(async()=>{
 const e=window.__engine, key=window.__roomStore.getState().boardId;
 if(!e||!key||!e._snapshotQuiet(e._activeId))throw Error('not quiet');
 const tiles=e._layers.get(e._activeId).allResident().map(t=>({x:t.originX,y:t.originY,w:t.buffer.width,h:t.buffer.height,rgba:t.buffer.readPixels()}));
 if(!tiles.length)throw Error('empty baseline');
 const response=await fetch('/api/rooms/'+key+'/snapshots/index');
 if(response.status!==200)throw Error('no snapshot');
 const index=await response.json();
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('qa728load',1);q.onupgradeneeded=()=>q.result.createObjectStore('fixtures');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction('fixtures','readwrite');tx.objectStore('fixtures').put({tiles,ops:e.getOperations(),layer:e._activeId,index},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 const result={room:key,tiles:tiles.length,ops:e.getOperations().length,indexSeq:index.seq,layerSeq:index.layers[0]?.seq,lost:e.gl.isContextLost(),census:window.__qa728FirstCopy?.slice(-2)};
 setTimeout(()=>location.reload(),100);return result;
})()
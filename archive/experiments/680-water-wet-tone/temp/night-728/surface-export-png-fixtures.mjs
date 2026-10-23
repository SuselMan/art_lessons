import {writeFileSync} from 'node:fs';
import {ev} from '/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/night-overlay/apps/web/scripts/devices/bridge.mjs';
for(const [key,name] of [['dense-baseline','native'],['on-replay','replay']]){
 const meta=await ev('twm2vt',`const db=await new Promise((res,rej)=>{const r=indexedDB.open('qa-728-surface',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const v=await new Promise((res,rej)=>{const r=db.transaction('fixtures').objectStore('fixtures').get(${JSON.stringify(key)});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();if(!v)throw Error('missing fixture');const a=v.rgba??v,c=document.createElement('canvas');c.width=1754;c.height=2480;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(a),1754,2480),0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png')),bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));window.__fixturePng64=btoa(s);return {length:window.__fixturePng64.length,bytes:bytes.length};`,45000);
 const pieces=[];for(let start=0;start<meta.length;start+=65536)pieces.push(await ev('twm2vt',`return window.__fixturePng64.slice(${start},${start+65536});`,10000));
 writeFileSync(new URL('./surface-dense-'+name+'.png',import.meta.url),Buffer.from(pieces.join(''),'base64'));console.log(JSON.stringify({name,...meta}));
}
await ev('twm2vt',`delete window.__fixturePng64;return true;`,10000);

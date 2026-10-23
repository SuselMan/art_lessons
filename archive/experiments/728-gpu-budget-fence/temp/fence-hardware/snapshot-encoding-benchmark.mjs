import {performance} from 'node:perf_hooks'
const bytes=Uint8Array.from({length:1048576},(_,i)=>(i*73+(i>>>5))&255)
const old=b=>{let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s)}
const chunks=b=>{const a=[];for(let i=0;i<b.length;i+=0x8000)a.push(String.fromCharCode(...b.subarray(i,i+0x8000)));return btoa(a.join(''))}
for(const n of [0,1,2,3,255,256,32767,32768,32769,65536,1048576]){const b=bytes.subarray(0,n);if(old(b)!==chunks(b))throw Error('mismatch '+n)}
const report={scope:'Node/VPS CPU microbenchmark, not hardware FPS',node:process.version,bytes:bytes.length,results:{}}
for(const [name,f]of [['old',old],['chunks',chunks]]){const t=[];for(let i=0;i<5;i++){const s=performance.now();f(bytes);t.push(performance.now()-s)}report.results[name]=t}
console.log(JSON.stringify(report,null,2))

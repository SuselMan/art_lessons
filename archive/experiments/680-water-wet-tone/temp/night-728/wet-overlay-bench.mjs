import { old } from './wet-overlay-old.mjs'
import { wetOverlayPixels, wetOverlayWorkspace } from './wet-overlay-new.mjs'
let seed=728, compared=0;
const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(const [w,h] of [[1,1],[1,143],[143,1],[11,13],[162,162],[224,318]]) for(let run=0;run<20;run++){
 const cells=Float32Array.from({length:w*h},()=>rand()*(run%3===0?2:1));
 const pools=Float32Array.from({length:w*h},()=>rand());
 const a=old(cells,pools,w,h), b=wetOverlayPixels(cells,pools,w,h,wetOverlayWorkspace(w*h));
 for(let i=0;i<a.length;i++) if(a[i]!==b[i]) throw new Error(`Mismatch ${w}x${h} run${run} byte${i}: ${a[i]}/${b[i]}`);
 compared+=a.length;
}
const w=162,h=224,cells=Float32Array.from({length:w*h},rand),pools=Float32Array.from({length:w*h},rand),workspace=wetOverlayWorkspace(w*h);
for(let i=0;i<10;i++){old(cells,pools,w,h);wetOverlayPixels(cells,pools,w,h,workspace)}
const times=[];
for(const fn of [()=>old(cells,pools,w,h),()=>wetOverlayPixels(cells,pools,w,h,workspace)]){const start=performance.now();for(let i=0;i<100;i++)fn();times.push((performance.now()-start)/100)}
console.log(JSON.stringify({comparedBytes:compared,exact:true,size:[w,h],meanMs:{old:times[0],candidate:times[1]},ratio:times[0]/times[1]}));

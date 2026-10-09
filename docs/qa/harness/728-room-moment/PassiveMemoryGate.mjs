/** Bounded passive memory observation only: never GC, close tabs, restart or drop caches. */
export async function waitForFreshMemory(read,{threshold=1700,maxWaitMs=30000,intervalMs=5000,onObserve=()=>{},now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(threshold!==1700||maxWaitMs<0||maxWaitMs>30000||intervalMs<=0||intervalMs>5000)throw Error('Strict bounded1700 memory gate required');const start=now(),end=start+maxWaitMs;let attempt=0;
 while(true){const free=await read();onObserve({free,attempt:attempt++,elapsedMs:now()-start});if(!Number.isFinite(free))throw Error('Fresh memory unavailable');if(free>=threshold)return free;if(now()>=end)throw Error('Fresh1700 preflight after passive30s hold');await sleep(Math.min(intervalMs,end-now()))}
}

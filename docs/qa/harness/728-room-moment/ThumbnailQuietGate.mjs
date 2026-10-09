/** QA precondition only, never a product upload retry or rate-limit exception. */
export async function waitForThumbnailQuiet(records,{now=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms)),quietMs=3250,maxMs=10000,onObserve=()=>{}}={}){
 const start=now();let observations=0;
 while(true){const t=now(),posts=records.filter(r=>r.method==='POST'&&r.endpoint==='/api/rooms/<room>/thumbnail'),pending=posts.some(r=>r.status===undefined),responses=posts.filter(r=>Number.isFinite(r.responseObservedWallTime)),last=responses.length?Math.max(...responses.map(r=>r.responseObservedWallTime)):null,remaining=last===null?0:Math.max(0,quietMs-(t-last));
  const row={elapsedMs:t-start,lastResponseObservedWallTime:last,pending,remainingMs:remaining};if(observations++<256)onObserve(row);
  if(!pending&&remaining===0)return{...row,quietMs,scope:'Passive QA quiet since latest observed thumbnail RESPONSE; no network suppression/retry'};
  if(t-start>=maxMs)throw Error('Thumbnail quiet precondition deadline');await delay(Math.min(50,maxMs-(t-start)));
 }
}

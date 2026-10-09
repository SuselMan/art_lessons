/** Passive bounded pre-context gate; child still performs its independent fresh gate. */
export async function awaitPairRam(read,{now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),budgetMs=30000,record=()=>{}}={}){
 if(budgetMs<0||budgetMs>30000)throw Error('Passive RAM budget must be at most30s')
 const start=now()
 while(true){const value=await read();if(!Number.isFinite(value)||value<0)throw Error('Fresh RAM unavailable');record(value);if(value>=1700)return value;if(now()-start>=budgetMs)throw Error('Passive RAM admission below1700MiB');await sleep(Math.min(1000,Math.max(0,budgetMs-(now()-start))))}
}

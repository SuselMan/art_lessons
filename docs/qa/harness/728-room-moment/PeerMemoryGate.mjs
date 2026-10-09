export async function peerMemoryGate(read,contexts,{now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),observe=()=>{}}={}){
 if(![0,1].includes(contexts))throw Error('Maximum two own contexts');const threshold=contexts===0?2200:1700,end=now()+30000;
 while(true){const free=await read();observe({contexts,threshold,free});if(!Number.isFinite(free))throw Error('Fresh RAM unavailable');if(free>=threshold)return free;if(now()>=end)throw Error('Peer RAM admission hold');await sleep(Math.min(5000,end-now()))}
}

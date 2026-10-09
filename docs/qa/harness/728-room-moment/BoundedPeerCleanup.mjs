/** Bound restoration of owned pages; renderer stalls must not retain device allocation. */
export async function boundedPeerCleanup(action,{timeoutMs=2000,onTimeout=()=>{}}={}){let timer;try{return await Promise.race([Promise.resolve().then(action),new Promise(resolve=>{timer=setTimeout(()=>{onTimeout();resolve(false)},timeoutMs)})])}catch{return false}finally{clearTimeout(timer)}}

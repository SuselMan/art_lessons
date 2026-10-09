// Real controller and offline subprocess share cleanup ordering and failures.
// Preserve the first failure while still closing all owned transport resources.
export async function finalizeController({monitor,hardTimer,closeOwn,ws,pending}){
 clearInterval(monitor);clearTimeout(hardTimer)
 let firstError
 try{await closeOwn()}catch(error){firstError=error}
 try{ws?.close()}catch(error){firstError??=error}
 try{for(const p of pending.values()){
  clearTimeout(p.timer)
  try{p.reject(Error('Own tab closed'))}catch(error){firstError??=error}
 }}finally{pending.clear()}
 if(firstError)throw firstError
}

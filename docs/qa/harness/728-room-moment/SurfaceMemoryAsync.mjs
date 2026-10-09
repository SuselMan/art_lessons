import{execFile}from'node:child_process';
/** Cached SSH endpoint only; async, unchanged default deadline10s, no retries. */
export function readSurfaceMemoryAsync({timeoutMs=10000,run=execFile,clock=()=>performance.now(),onDiagnostic=()=>{}}={}){
 const start=clock();return new Promise((resolve,reject)=>{const controller=new AbortController();let settled=false,timedOut=false;
 const finish=(error,stdout)=>{if(settled)return;settled=true;clearTimeout(timer);const elapsedMs=clock()-start;onDiagnostic({elapsedMs,timedOut,success:!error});if(error){reject(Error(timedOut?'Surface RAM deadline':'Surface RAM SSH failure',{cause:error}));return}const text=String(stdout).trim();if(!/^\d+(?:\.\d+)?$/.test(text)){reject(Error('Surface RAM numeric output required'));return}const freeMiB=Number(text);if(!Number.isFinite(freeMiB)){reject(Error('Surface RAM finite output required'));return}resolve(freeMiB)};
 const timer=setTimeout(()=>{timedOut=true;controller.abort();finish(Error('deadline'))},timeoutMs);
 try{run('ssh',['surface','powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)"'],{encoding:'utf8',timeout:timeoutMs,signal:controller.signal,maxBuffer:16384},(error,stdout)=>finish(error,stdout))}catch(error){finish(error)}
 });
}

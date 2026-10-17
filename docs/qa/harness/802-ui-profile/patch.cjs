const assert=require('node:assert/strict'),crypto=require('node:crypto');
const ENTRY_SHA='5f2a445b88ac99d3533885cb1d4c8ba97889f3487943f0d610aa59a9b8ad0ea5',WORKER_SHA='5f9d8637b6ff2ffaf92373e3166fd9897c15025b51e24ac48265cc752cf648a6';
const anchor='t("diagnostics").textContent=JSON.stringify(H(),null,2)',hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function replaceOnce(source,needle,value){assert.equal(source.split(needle).length-1,1,'Exactly one diagnostic anchor');return source.replace(needle,value)}
function patch(entry,worker,withoutJSON,workerObserver,workerOptions={}){assert.equal(hash(entry),ENTRY_SHA,'Published UI entry changed');assert.equal(hash(worker),WORKER_SHA,'Published worker entry changed');assert.equal(entry.split(anchor).length-1,1,'Exactly one diagnostic panel anchor');return{entry:withoutJSON?replaceOnce(entry,anchor,'void 0'):entry,worker:';('+workerObserver.toString()+')('+JSON.stringify(workerOptions)+');\n'+worker,originalEntrySHA:ENTRY_SHA,originalWorkerSHA:WORKER_SHA,withoutJSON}}
module.exports={replaceOnce,patch,hash,ENTRY_SHA,WORKER_SHA};

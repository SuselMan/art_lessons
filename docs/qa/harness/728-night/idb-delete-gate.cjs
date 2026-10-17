// QA preload: native IndexedDB transaction commits normally. Only the callback
// resolving OutboxStorage.delete is delayed, on one actual stroke deletion.
async function installOutboxDeleteGate(context){await context.addInitScript(()=>{
 const nativeDelete=IDBObjectStore.prototype.delete,complete=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete'),transactions=new WeakSet();
 const gate=window.__qaOutboxDeleteGate={enabled:false,targetLayer:null,operationId:null,held:0,heldAt:null,releasedAt:null,pending:[],acceptedOldEntry:null,release(){this.enabled=false;this.releasedAt=performance.now();const tasks=this.pending.splice(0);for(const task of tasks)task();return tasks.length}};
 IDBObjectStore.prototype.delete=function(key){const entry=window.__engine?._log.entries.find(x=>x.op.id===key);if(gate.enabled&&this.name==='pending-operations'&&this.transaction.db.name==='pencil-outbox'&&entry?.op.type==='stroke'&&entry.op.layerId===gate.targetLayer){transactions.add(this.transaction);gate.operationId=String(key);gate.acceptedOldEntry={id:entry.op.id,pending:!!entry.pending,state:entry.state,board:window.__roomStore.getState().boardId}}return nativeDelete.call(this,key)};
 Object.defineProperty(IDBTransaction.prototype,'oncomplete',{...complete,set(callback){complete.set.call(this,callback?function(event){if(gate.enabled&&transactions.has(this)){gate.held++;gate.heldAt=performance.now();const transaction=this;gate.pending.push(()=>callback.call(transaction,event));return}return callback.call(this,event)}:null)}});
 })}
module.exports={installOutboxDeleteGate};

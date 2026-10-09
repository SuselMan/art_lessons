const receipts=new WeakMap();
const identityKeys=['ownerSequence','epoch','packedSha','paperSha','sourceHead'];
/** One-shot interception of an owned passes.fieldOp(mode 15). No pause, timers or clock overrides. */
export function installOwnedBeforeCarryCapture({passes,enabled=false,describe,capture,onCaptured}={}){
 if(!enabled)return{dispose(){},armed:false};
 if(typeof passes?.fieldOp!=='function'||typeof describe!=='function'||typeof capture!=='function')throw Error('Owned fieldOp capture contract');
 const original=passes.fieldOp;let armed=true,disposed=false;
 function dispose(){if(!disposed&&passes.fieldOp===hook)passes.fieldOp=original;disposed=true;armed=false;}
 function hook(...args){
  if(!armed||args[3]!==15)return original.apply(this,args);
  const before=describe(args);if(before?.ownerSequence!==2)return original.apply(this,args);
  // Readback and metadata are synchronous before canonical carry submission.
  dispose();let snapshot,error;
  try{snapshot=capture(args,before);const after=describe(args);if(identityKeys.concat(['passStep','passStride']).some(k=>before[k]!==after[k]))throw Error('Capture stage changed synchronously');const receipt=Object.freeze({...before,stage:'before-carry'});receipts.set(snapshot,receipt);}catch(e){error=e;}
  // Canonical is released immediately, even when diagnostics failed.
  const result=original.apply(this,args);
  onCaptured?.({snapshot,error,receipt:snapshot?receipts.get(snapshot):null});return result;
 }
 passes.fieldOp=hook;return{dispose,get armed(){return armed}};
}
export function capturedStageReceipt(snapshot){return receipts.get(snapshot)??null;}
export function validateCapturedIdentity(snapshot,current){const receipt=receipts.get(snapshot);if(!receipt||!current||identityKeys.some(k=>receipt[k]!==current[k]))throw Error('Captured source identity changed');return receipt;}

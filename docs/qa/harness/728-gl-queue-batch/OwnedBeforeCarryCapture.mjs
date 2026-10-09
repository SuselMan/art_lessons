const receipts=new WeakMap();
const identityKeys=['ownerSequence','epoch','packedSha','paperSha','sourceHead'];
/** One-shot at carryPair dispatch or first ordinary C/P pass, preserving flags. */
export function installOwnedBeforeCarryCapture({passes,enabled=false,describe,capture,onCaptured}={}){
 if(!enabled)return{dispose(){},armed:false};
 if(typeof passes?.fieldOp!=='function'||typeof describe!=='function'||typeof capture!=='function')throw Error('Owned fieldOp capture contract');
 const original=passes.fieldOp,originalPair=passes.carryPair;let armed=true,disposed=false;
 function dispose(){if(!disposed){if(passes.fieldOp===hook)passes.fieldOp=original;if(passes.carryPair===pairHook)passes.carryPair=originalPair;}disposed=true;armed=false;}
 function intercept(originalFn,self,args,route){
  if(!armed)return originalFn.apply(self,args);
  const before=describe(args,route);if(before?.ownerSequence!==2)return originalFn.apply(self,args);
  dispose();let snapshot,error;
  try{snapshot=capture(args,before,route);const after=describe(args,route);if(identityKeys.concat(['passStep','passStride']).some(k=>before[k]!==after[k]))throw Error('Capture stage changed synchronously');const receipt=Object.freeze({...before,stage:'before-carry',route});receipts.set(snapshot,receipt);}catch(e){error=e;}
  // carryPair may return false: normal caller then executes legacy16/15 unchanged.
  const result=originalFn.apply(self,args);
  onCaptured?.({snapshot,error,receipt:snapshot?receipts.get(snapshot):null});return result;
 }
 function hook(...args){if(args[3]!==15&&args[3]!==16)return original.apply(this,args);return intercept(original,this,args,args[3]===16?'ordinary-C16':'ordinary-P15');}
 function pairHook(...args){return intercept(originalPair,this,args,'carryPair-dispatch');}
 passes.fieldOp=hook;if(typeof originalPair==='function')passes.carryPair=pairHook;return{dispose,get armed(){return armed}};
}
export function capturedStageReceipt(snapshot){return receipts.get(snapshot)??null;}
export function validateCapturedIdentity(snapshot,current){const receipt=receipts.get(snapshot);if(!receipt||!current||identityKeys.some(k=>receipt[k]!==current[k]))throw Error('Captured source identity changed');return receipt;}

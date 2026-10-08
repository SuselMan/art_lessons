/** QA-only sampling control. Existing native shader arithmetic/order and
 * planner ownership remain unchanged. Hardware LINEAR applies to pressure D
 * in original carry15/16 only; all other live field inputs MUST be NEAREST. */
export function installCarryPressureControl(adapter:any,enabled=false){
 if(typeof enabled!=='boolean'||typeof adapter.fieldOp!=='function')throw Error('Explicit carry sampling control')
 if(enabled&&(adapter.diagnosticHardwareLinearInputs||adapter.diagnosticPairedCarry))throw Error('Carry pressure-only arm requires original unpaired/manual baseline')
 const original=adapter.fieldOp,counters={mode15:0,mode16:0,other:0};let detached=false
 const wrapped=function(this:any,out:any,a:any,b:any,mode:number,k:number,options:any={}){
  if(!enabled||!(mode===15||mode===16)){counters.other++;return original.call(this,out,a,b,mode,k,options)}
  if(options.d?.field?.filter!=='linear'||[a,b,options.c,options.e,options.path].some(f=>f&&f.field?.filter!=='nearest'))throw Error('Pressure D must be ONLY LINEAR carry input')
  if(mode===15)counters.mode15++;else counters.mode16++
  const before=this.diagnosticHardwareLinearInputs;this.diagnosticHardwareLinearInputs=true
  try{return original.call(this,out,a,b,mode,k,options)}finally{this.diagnosticHardwareLinearInputs=before}
 }
 adapter.fieldOp=wrapped
 return{counters,detach(){if(detached)return;detached=true;if(adapter.fieldOp!==wrapped)throw Error('Carry control wrapper ownership changed');adapter.fieldOp=original}}
}

// QA-only opt-in before any engine becomes visible to room restoration.
async function installHiddenReplay(context,enabled){
 if(!enabled)return;
 await context.addInitScript(()=>{
  let value;window.__qaHiddenEngineAssignments=[];
  Object.defineProperty(window,'__engine',{configurable:true,get:()=>value,set:engine=>{
   value=engine;if(engine){engine.diagnosticM70HiddenReplay=true;window.__qaHiddenEngineAssignments.push({at:performance.now(),model:engine._watercolorModel})}
  }});
 });
}
module.exports={installHiddenReplay};

/** CPU elapsed includes GL submission. Own time subtracts instrumented children only. */
export class CpuProbe {
 constructor(now=()=>performance.now()){this.now=now;this.stack=[];this.methods={};this.restores=[];this.prepareSnapshots=[];}
 measure(name,call){const row=this.methods[name]||={calls:0,totalMs:0,ownMs:0,maxMs:0};const frame={start:this.now(),children:0};this.stack.push(frame);try{return call();}finally{const elapsed=this.now()-frame.start;this.stack.pop();row.calls++;row.totalMs+=elapsed;row.ownMs+=elapsed-frame.children;row.maxMs=Math.max(row.maxMs,elapsed);const parent=this.stack.at(-1);if(parent)parent.children+=elapsed;}}
 wrap(owner,name,label=name,{generator=false,after}={}){const original=owner?.[name];if(typeof original!=='function')return false;const p=this;function wrapped(...args){const result=p.measure(label,()=>original.apply(this,args));after?.();if(generator&&result&&typeof result.next==='function'){for(const method of ['next','return','throw']){const next=result[method];if(typeof next==='function')result[method]=function(...a){return p.measure(label+'.'+method,()=>next.apply(this,a));};}}return result;}owner[name]=wrapped;this.restores.push(()=>{if(owner[name]===wrapped)owner[name]=original});return true;}
 dispose(){for(const restore of this.restores.splice(0))restore();}
}
export function configureDiagnostic(engine,variant){
 const plan=engine._settlePlan;if(!plan)throw new Error('Actual settle plan absent');
 const required=['diagnosticContactFieldCache','diagnosticReuseFlowRaster'];
 for(const key of required)if(!(key in plan))throw new Error('Bundle missing '+key+'; rebuild from root source');
 plan.diagnosticContactFieldCache=variant==='cache';plan.diagnosticReuseFlowRaster=variant==='workspace';
 if(!['off','cache','workspace'].includes(variant))throw new Error('Unknown diagnostic variant');
 return {contactCache:plan.diagnosticContactFieldCache,flowWorkspace:plan.diagnosticReuseFlowRaster};
}
export function snapshotPlan(plan){return JSON.parse(JSON.stringify({cache:plan.contactFieldCacheStats,workspace:plan.flowRasterStats,flowUpload:plan.flowUploadStats}));}

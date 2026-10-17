import type {FieldLease} from './FieldJobLease.external'
type BudgetResult={ok:true}|{ok:false;reason:string}
type Hooks={cancelAll(lost:boolean):void;releaseTextures():void;setBudget(bytes:number):BudgetResult}
const MiB=1024*1024
/** Diagnostic primitive ONLY. All callers must install leases before enabling. */
export class M70PhaseOwner {
 private generation=0
 private leases=new Set<symbol>()
 private tokens=new WeakMap<FieldLease,{generation:number;token:symbol}>()
 private execution=new Map<symbol,number>()
 private transitioning=false
 private phase:'idle'|'input'|'solve'|'lost'='idle'
 private readonly hooks:Hooks
 private readonly enabled:boolean
 constructor(hooks:Hooks,enabled=false){this.hooks=hooks;this.enabled=enabled}
 get state(){return {generation:this.generation,activeLeases:this.leases.size,executing:[...this.execution.values()].reduce((a,b)=>a+b,0),transitioning:this.transitioning,phase:this.phase,enabled:this.enabled}}
 private transition<T>(work:()=>T):T{if(this.transitioning||this.phase==='lost')throw Error('Phase unavailable');this.transitioning=true;try{return work()}finally{this.transitioning=false}}
 private sameGeneration(g:number){if(g!==this.generation||this.phase==='lost')throw Error('Stale phase transition')}
 acquire(parent?:FieldLease):FieldLease{
  if(this.transitioning||this.phase==='lost')throw Error('Field ownership unavailable')
  return this.grant(parent)
 }
 private grant(parent?:FieldLease):FieldLease{
  const family=parent&&this.tokens.get(parent)
  if(parent&&(!family||family.generation!==this.generation||!this.leases.has(family.token)))throw Error('Invalid parent field lease')
  if(!parent&&(this.leases.size||this.execution.size))throw Error('Foreign field owner active')
  const token=Symbol(),generation=this.generation;this.leases.add(token);let released=false
  const lease={release:()=>{if(released)return;released=true;if(generation===this.generation)this.leases.delete(token)},enter:()=>{if(generation!==this.generation||!this.leases.has(token))throw Error('Stale field execution');this.execution.set(token,(this.execution.get(token)??0)+1)},leave:()=>{if(generation!==this.generation)return;const depth=this.execution.get(token)??0;if(depth<=1)this.execution.delete(token);else this.execution.set(token,depth-1)}}
  this.tokens.set(lease,{generation,token});return lease
 }
 beginInput():boolean{
  if(!this.enabled||this.transitioning||this.phase==='lost')return false
  return this.transition(()=>{const g=this.generation;this.hooks.cancelAll(false);this.sameGeneration(g);if(this.leases.size||this.execution.size)return false;this.hooks.releaseTextures();this.sameGeneration(g);this.phase='idle';const result=this.hooks.setBudget(224*MiB);this.sameGeneration(g);if(!result.ok)throw Error(result.reason);this.phase='input';return true})
 }
 beginSolve<T>(capture:()=>T):{snapshot:T;lease:FieldLease}|null{
  if(!this.enabled||this.transitioning||this.phase==='lost'||this.leases.size||this.execution.size)return null
  return this.transition(()=>{const g=this.generation;const snapshot=capture();this.sameGeneration(g);const result=this.hooks.setBudget(120*MiB);this.sameGeneration(g);if(!result.ok)return null;this.phase='solve';return {snapshot,lease:this.grant()}})
 }
 beginSolveSnapshot<T>(snapshot:T):{snapshot:T;lease:FieldLease}|null{return this.beginSolve(()=>snapshot)}
 releaseIdleTextures():boolean{
  if(this.transitioning||this.phase==='lost'||this.leases.size||this.execution.size)return false
  return this.transition(()=>{const g=this.generation;this.hooks.releaseTextures();this.sameGeneration(g);this.phase='idle';return true})
 }
 contextLost():void{
  this.generation++;this.leases.clear();this.execution.clear();this.phase='lost'
  this.hooks.cancelAll(true)
 }
 contextRestored():void{
  if(this.transitioning||this.phase!=='lost')throw Error('Invalid phase restore')
  const g=this.generation,result=this.hooks.setBudget(120*MiB);if(g!==this.generation||this.phase!=='lost')throw Error('Stale phase restore');if(!result.ok)throw Error(result.reason)
  this.phase='idle'
 }
}

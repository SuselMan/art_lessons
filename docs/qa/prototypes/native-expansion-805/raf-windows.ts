export type RafSample805={n:number;ms:number;max:number;valid:boolean}
type Window805=RafSample805&{start:number;end:number|null;done?:(_sample:RafSample805)=>void}
/** Count complete frame intervals intersecting a gesture, including its trailing
 * interval. A synchronous main-thread result arrives before that frame does. */
export class RafWindows805{
 private readonly windows=new Map<number,Window805>()
 get pending(){return this.windows.size}
 begin(id:number,start:number,valid=true){this.windows.set(id,{start,end:null,n:0,ms:0,max:0,valid});if(this.windows.size>16)this.windows.delete(this.windows.keys().next().value!)}
 end(id:number,end:number,done:(_sample:RafSample805)=>void){const w=this.windows.get(id);if(w){w.end=end;w.done=done}}
 cancel(id:number){this.windows.delete(id)}
 clear(){this.windows.clear()}
 invalidate(){for(const w of this.windows.values())w.valid=false}
 frame(previous:number|null,current:number){
  for(const[id,w]of this.windows){
   if(previous!==null&&current>previous&&current>w.start&&(w.end===null||previous<w.end)){const gap=current-previous;w.n++;w.ms+=gap;w.max=Math.max(w.max,gap)}
   if(w.end!==null&&current>=w.end){this.windows.delete(id);w.done?.({n:w.n,ms:w.ms,max:w.max,valid:w.valid})}
  }
 }
}

export function install(e){
 const scheduler=e._wcDryWorkScheduler,can=scheduler.ctx.canRunTasks,wait=e._waitForDryGpu,advance=e._advanceAsyncCanonical;const stats={skippedWaits:0,capped:0};
 scheduler.ctx.canRunTasks=function(){return !scheduler.active&&can()};
 e._waitForDryGpu=function(){if(scheduler.active){this._wcDryGpuFencePending=0;stats.skippedWaits++;return}return wait.call(this)};
 e._advanceAsyncCanonical=function(work,current){if(!scheduler.active)return advance.call(this,work,current);stats.capped++;let step;const start=performance.now();for(let i=0;i<8;i++){step=work.next();if(!current()||this._contextLost||this.gl.isContextLost())return step;this._syncContinuationGpu();if(step.done||this._settle||performance.now()-start>=this._sliceLimits.budgetMs)return step}return step};
 return{stats:()=>({...stats}),dispose(){scheduler.ctx.canRunTasks=can;e._waitForDryGpu=wait;e._advanceAsyncCanonical=advance}};
}

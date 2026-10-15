export function install(e,budget){const gl=e.gl,original={},viewport=Array.from(gl.getParameter(gl.VIEWPORT)),scissor=Array.from(gl.getParameter(gl.SCISSOR_BOX));let clipped=gl.isEnabled(gl.SCISSOR_TEST),work=0,pixels=0,fences=0;const sync=e._syncContinuationGpu,wait=e._waitForDryGpu;
function wrap(name,fn){original[name]=gl[name];gl[name]=fn(original[name].bind(gl))}
const area=()=>clipped?Math.max(0,Math.min(viewport[0]+viewport[2],scissor[0]+scissor[2])-Math.max(viewport[0],scissor[0]))*Math.max(0,Math.min(viewport[1]+viewport[3],scissor[1]+scissor[3])-Math.max(viewport[1],scissor[1])):viewport[2]*viewport[3];
wrap('viewport',orig=>(...a)=>{viewport.splice(0,4,...a);return orig(...a)});wrap('scissor',orig=>(...a)=>{scissor.splice(0,4,...a);return orig(...a)});
wrap('enable',orig=>cap=>{if(cap===gl.SCISSOR_TEST)clipped=true;return orig(cap)});wrap('disable',orig=>cap=>{if(cap===gl.SCISSOR_TEST)clipped=false;return orig(cap)});
for(const name of ['drawArrays','clear'])wrap(name,orig=>(...a)=>{const n=area();work+=n;pixels+=n;return orig(...a)});
wrap('finish',orig=>(...a)=>{const result=orig(...a);work=0;return result});
e._waitForDryGpu=function(){const result=wait.call(this);work=0;fences++;return result};
e._syncContinuationGpu=function(){if(!this._boundedDryClockActive()||this._wcContinuationGpuFence||this._strokeLayerId||this._contextLost)return sync.call(this);if(work>=budget)this._waitForDryGpu()};
return{stats:()=>({budget,pixels,fences,pendingPixels:work}),dispose(){e._syncContinuationGpu=sync;e._waitForDryGpu=wait;for(const[name,fn]of Object.entries(original))gl[name]=fn}}}

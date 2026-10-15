import {GpuBudgetFence} from '/src/engine/src/raster/GpuBudgetFence.ts';
export function install(e,mode){const original=GpuBudgetFence.prototype.sync;let reads=0;
GpuBudgetFence.prototype.sync=function(){const gl=this.gl;if(gl.isContextLost()){this.forget();return}if(mode==='current'){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,this.pixel);reads++;return}this.ensure();if(gl.isContextLost()){this.forget();return}const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING);try{gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,this.pixel);reads++}finally{if(!gl.isContextLost())gl.bindFramebuffer(gl.FRAMEBUFFER,previous);else this.forget()}};
return{stats:()=>({mode,reads}),dispose(){GpuBudgetFence.prototype.sync=original}}}

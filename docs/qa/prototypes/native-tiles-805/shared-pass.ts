import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
/** QA execution tiling, NOT memory paging. Every source remains an immutable
 * complete previous-pass texture. Disjoint destination scissors partition each
 * native draw exactly; completion of all cores precedes the next native draw.
 * No shader replacement, border clamp, blend overlap or pixel interpolation. */
export function installSharedPassTiles805(gl:WebGLRenderingContext,size=1024){
 const beginNames=['beginDraw','beginErase','beginKeepDraw','beginAdditiveDraw','beginReplaceDraw','beginMaxDraw'] as const
 const proto=AccumulationBuffer.prototype as any,originals=new Map<string,Function>(),dimensions=new WeakMap<WebGLFramebuffer,{width:number;height:number}>()
 let bound:WebGLFramebuffer|null=null,enabled=true,destroyed=false
 const bind=gl.bindFramebuffer,draw=gl.drawArrays,scissor=gl.scissor,enable=gl.enable,disable=gl.disable
 let clipped=false,clip=[0,0,0,0]
 const stats={nativeDraws:0,splitDraws:0,coreDraws:0,mode:'shared-previous-pass-textures',memoryPaged:false}
 for(const name of beginNames){const original=proto[name];originals.set(name,original);proto[name]=function(...args:any[]){if(this.gl===gl)dimensions.set(this._fbo,{width:this.width,height:this.height});return original.apply(this,args)}}
 gl.bindFramebuffer=function(target,fbo){if(target===gl.FRAMEBUFFER)bound=fbo;return bind.call(gl,target,fbo)}
 gl.scissor=function(x,y,w,h){clip=[x,y,w,h];return scissor.call(gl,x,y,w,h)}
 gl.enable=function(cap){if(cap===gl.SCISSOR_TEST)clipped=true;return enable.call(gl,cap)}
 gl.disable=function(cap){if(cap===gl.SCISSOR_TEST)clipped=false;return disable.call(gl,cap)}
 gl.drawArrays=function(mode,first,count){stats.nativeDraws++;const out=bound&&dimensions.get(bound);if(!enabled||!out||out.width<=size&&out.height<=size)return draw.call(gl,mode,first,count)
  const oldClip=[...clip],wasClipped=clipped;enable.call(gl,gl.SCISSOR_TEST);stats.splitDraws++
  try{for(let y=0;y<out.height;y+=size)for(let x=0;x<out.width;x+=size){const l=wasClipped?Math.max(x,oldClip[0]):x,b=wasClipped?Math.max(y,oldClip[1]):y,r=Math.min(out.width,x+size,wasClipped?oldClip[0]+oldClip[2]:Infinity),t=Math.min(out.height,y+size,wasClipped?oldClip[1]+oldClip[3]:Infinity);if(r<=l||t<=b)continue;scissor.call(gl,l,b,r-l,t-b);draw.call(gl,mode,first,count);stats.coreDraws++}}
  finally{scissor.call(gl,oldClip[0],oldClip[1],oldClip[2],oldClip[3]);if(!wasClipped)disable.call(gl,gl.SCISSOR_TEST)}
 }
 return{stats,set(value:{enabled?:boolean;size?:number}){if(destroyed)throw Error('Tile executor destroyed');if(value.size!==undefined){if(!Number.isInteger(value.size)||value.size<128||value.size>2048)throw Error('Invalid tile size');size=value.size}if(value.enabled!==undefined)enabled=value.enabled},get configuration(){return{size,enabled}},get enabled(){return enabled},destroy(){if(destroyed)return;destroyed=true;gl.drawArrays=draw;gl.bindFramebuffer=bind;gl.scissor=scissor;gl.enable=enable;gl.disable=disable;for(const[name,original]of originals)proto[name]=original}}
}

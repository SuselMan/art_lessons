import {RIBBON_FLOATS_PER_VERTEX as stride} from '/src/engine/src/dabs/markerRibbon.ts';
import { DISPLAY_VERT, WC_WATER_FRONT_FRAG } from '/src/engine/src/raster/shaders.ts';

import { createProgram,getUniforms } from '/src/engine/src/raster/utils.ts';
class FloatTerrain {
 constructor(gl,width,height){this.gl=gl;this.width=width;this.height=height;if(!gl.getExtension('OES_texture_float')||!gl.getExtension('WEBGL_color_buffer_float'))throw Error('Float terrain unavailable');this.texture=gl.createTexture();this.fbo=gl.createFramebuffer();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.FLOAT,null);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Float terrain FBO incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
 beginReplaceDraw(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,this.width,this.height);gl.disable(gl.BLEND)}
 endDraw(){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);this.gl.disable(this.gl.BLEND)}
 destroy(){this.gl.deleteTexture(this.texture);this.gl.deleteFramebuffer(this.fbo)}
}
FloatTerrain.prototype.beginMaxDraw=function(ext){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,this.width,this.height);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.blendEquation(ext.MAX_EXT)};
FloatTerrain.prototype.endDraw=function(){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);this.gl.disable(this.gl.BLEND);this.gl.blendEquation(this.gl.FUNC_ADD)};
export async function install(e){
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');const gl=e.gl;if(!gl.getExtension('EXT_float_blend'))throw Error('Float blend unavailable');
 const ctx=e._ribbonPainter.ctx,passes=e._watercolorPasses,records=new Map(),colours=new Map(),free=[],saved=[];let lastMass=null,working=false,allocated=0;const stats={massStamps:0,colourStampsSkipped:0,massBands:0,colourBandsSkipped:0,materializations:0,allocatedBytes:0};
 const shader=`precision highp float;varying vec2 v_uv;uniform highp sampler2D u_source;uniform vec3 u_tau;uniform float u_colour;void main(){vec4 p=texture2D(u_source,v_uv);gl_FragColor=u_colour>0.5?vec4(p.b*u_tau/4.0,p.b):p;}`;
 const program=createProgram(gl,DISPLAY_VERT,shader),u=getUniforms(gl,program,['u_source','u_tau','u_colour']),pos=gl.getAttribLocation(program,'a_position');
 function get(out){let r=records.get(out);if(r)return r;if(out.width!==1024||out.height!==1024)return null;let raw=free.pop();if(!raw){if(allocated>=2)return null;raw=new FloatTerrain(gl,out.width,out.height);allocated++;stats.allocatedBytes=allocated*out.width*out.height*16}raw.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);raw.endDraw();r={out,raw,colour:null,tau:null,dirty:false};records.set(out,r);return r}
 function setColour(r,out,tau){if(r.tau&&r.tau.some((v,i)=>v!==tau[i]))throw Error('Changing tau in one float film');r.tau=[...tau];r.colour=out;colours.set(out,r)}
 function draw(out,r,colour){out.beginReplaceDraw();if(r.bounds){const q=r.bounds;gl.enable(gl.SCISSOR_TEST);gl.scissor(q[0],out.height-q[3],q[2]-q[0],q[3]-q[1])}else gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,passes.ctx.screenBuf());gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,r.raw.texture);gl.uniform1i(u.u_source,0);gl.uniform3fv(u.u_tau,r.tau??[0,0,0]);gl.uniform1f(u.u_colour,colour?1:0);gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();gl.disable(gl.SCISSOR_TEST)}
 function materialize(r){if(!r||!r.dirty||working)return;working=true;try{draw(r.out,r,false);if(r.colour)draw(r.colour,r,true);r.dirty=false;r.bounds=null;stats.materializations++}finally{working=false}}
 function prepare(buffers){if(working)return;for(const b of buffers)materialize(records.get(b)??colours.get(b))}
 function releaseAll(){for(const r of records.values()){materialize(r);free.push(r.raw)}records.clear();colours.clear();lastMass=null}
 function bound(r,x0,y0,x1,y1){const q=[Math.max(0,Math.floor(x0)-2),Math.max(0,Math.floor(y0)-2),Math.min(r.out.width,Math.ceil(x1)+2),Math.min(r.out.height,Math.ceil(y1)+2)];if(r.bounds){q[0]=Math.min(q[0],r.bounds[0]);q[1]=Math.min(q[1],r.bounds[1]);q[2]=Math.max(q[2],r.bounds[2]);q[3]=Math.max(q[3],r.bounds[3])}r.bounds=q}
 function nibBound(r,a){const d=a[2],radius=d.size*.5*a[3].sizeMultiplier,c=Math.abs(Math.cos(d.angle)),s=Math.abs(Math.sin(d.angle)),x=radius*(Math.abs(d.aspectRatio)*c+s),y=radius*(Math.abs(d.aspectRatio)*s+c),cx=d.x-a[1].originX,cy=d.y-a[1].originY;bound(r,cx-x,cy-y,cx+x,cy+y)}
 function bandBound(r,a){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let i=0;i<a[2].length;i+=stride){x0=Math.min(x0,a[2][i]);x1=Math.max(x1,a[2][i]);y0=Math.min(y0,a[2][i+1]);y1=Math.max(y1,a[2][i+1])}bound(r,x0-a[1].originX,y0-a[1].originY,x1-a[1].originX,y1-a[1].originY)}
 function begin(r){gl.bindFramebuffer(gl.FRAMEBUFFER,r.raw.fbo);gl.viewport(0,0,r.raw.width,r.raw.height);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.blendEquation(e._minmaxExt.MAX_EXT)}
 function end(r){r.raw.endDraw();gl.blendEquation(gl.FUNC_ADD);r.dirty=true}
 function wrap(obj,name,make){const orig=obj[name];saved.push([obj,name,orig]);obj[name]=make(orig)}
 wrap(ctx,'drawRibbonNibPass',orig=>function(...a){if(a[5]===7&&a[4].normalizeDeposit&&a[7]===false&&e._minmaxExt){
  if(!a[16]&&a[11]>0){lastMass=a[0];const r=get(a[0]);if(r){nibBound(r,a);begin(r);const args=[...a];args[0]=r.raw;const result=orig.apply(this,args);end(r);stats.massStamps++;return result}}
  else if(a[16]){const r=records.get(lastMass);if(r){setColour(r,a[0],a[16]);stats.colourStampsSkipped++;return}}
 }return orig.apply(this,a)});
 wrap(ctx,'drawRibbonBands',orig=>function(...a){if(a[3]==='ink-max'){
  if(!a[12]){lastMass=a[0];const r=records.get(a[0]);if(r){bandBound(r,a);const args=[...a];args[0]=r.raw;const value=orig.apply(this,args);r.dirty=true;stats.massBands++;return value}}
  else {const r=records.get(lastMass);if(r){setColour(r,a[0],a[12]);stats.colourBandsSkipped++;return}}
 }return orig.apply(this,a)});
 wrap(passes,'fieldOp',orig=>function(...a){prepare([a[0],a[1],a[2],a[5]?.c,a[5]?.d,a[5]?.e]);return orig.apply(this,a)});
 wrap(passes,'wcResample',orig=>function(...a){prepare([a[0],a[5],a[10],a[11]]);return orig.apply(this,a)});
 for(const name of ['copyTo','copyRegionInto'])wrap(AccumulationBuffer.prototype,name,orig=>function(...a){if(this.gl===gl)prepare([this,a[0]]);return orig.apply(this,a)});
 for(const name of ['readPixels','readPixelsRegion'])wrap(AccumulationBuffer.prototype,name,orig=>function(...a){if(this.gl===gl)prepare([this]);return orig.apply(this,a)});
 wrap(AccumulationBuffer.prototype,'clear',orig=>function(...a){if(this.gl===gl){const r=records.get(this)??colours.get(this);if(r){materialize(r);records.delete(r.out);if(r.colour)colours.delete(r.colour);free.push(r.raw)}}return orig.apply(this,a)});
 wrap(e,'_drawRibbonCompositeRect',orig=>function(...a){prepare([a[4],a[5],a[6],a[7]]);return orig.apply(this,a)});
 wrap(e,'_finishRibbonStroke',orig=>function(...a){if(a[4])releaseAll();return orig.apply(this,a)});
 return{stats:()=>({...stats,pending:records.size}),dispose(){if(!gl.isContextLost())releaseAll();for(const[obj,name,fn]of saved)obj[name]=fn;for(const raw of new Set([...free,...[...records.values()].map(r=>r.raw)]))raw.destroy();records.clear();colours.clear();gl.useProgram(null);gl.deleteProgram(program)}};
}

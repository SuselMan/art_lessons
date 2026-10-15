import { DISPLAY_VERT, WC_WATER_FRONT_FRAG } from '/src/engine/src/raster/shaders.ts';

import { createProgram,getUniforms } from '/src/engine/src/raster/utils.ts';
class FloatTerrain {
 constructor(gl,width,height){this.gl=gl;this.width=width;this.height=height;if(!gl.getExtension('OES_texture_float')||!gl.getExtension('WEBGL_color_buffer_float'))throw Error('Float terrain unavailable');this.texture=gl.createTexture();this.fbo=gl.createFramebuffer();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.FLOAT,null);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Float terrain FBO incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
 beginReplaceDraw(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,this.width,this.height);gl.disable(gl.BLEND)}
 endDraw(){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);this.gl.disable(this.gl.BLEND)}
 destroy(){this.gl.deleteTexture(this.texture);this.gl.deleteFramebuffer(this.fbo)}
}
export function install(engine){
 const passes=engine._watercolorPasses,ctx=passes.ctx,gl=engine.gl,original=passes.waterFrontStep;
 const prefix=WC_WATER_FRONT_FRAG.slice(0,WC_WATER_FRONT_FRAG.indexOf('  void main()'));
 const shader=prefix+`vec2 encodeTerrain(float v){float q=floor(clamp(v,0.0,1.0)*65535.0+0.5);return vec2(floor(q/256.0),mod(q,256.0))/255.0;}
 void main(){vec2 px=v_uv*u_resolution;float feather=(1.0+WC_FRONT_FEATHER*smoothstep(WC_FRONT_FEATHER_LO,WC_FRONT_FEATHER_HI,wcFbm((px+u_paperOrigin)*WC_FRONT_FEATHER_SCALE+vec2(41.0,7.0))));gl_FragColor=vec4(wcFrontHeightAt(px),feather,0.0,1.0);}`;
 const prog=createProgram(gl,DISPLAY_VERT,shader),u=getUniforms(gl,prog,['u_resolution','u_paperOrigin','u_paperTexSize','u_paperScale','u_paperHeightMap','u_wcNoiseTex']),pos=gl.getAttribLocation(prog,'a_position');let terrain=null,key=null,builds=0;
 passes.waterFrontStep=function(...args){const[field,x0,y0,,,,,,,,scale=1]=args;const size=ctx.paperWorldSize(),next=[field.w,field.h,x0,y0,scale,ctx.paperTex(),ctx.paperScale(),size.w,size.h];
 if(!key||next.some((v,i)=>v!==key[i])){terrain?.destroy();terrain=new FloatTerrain(gl,field.w,field.h);const dither=gl.isEnabled(gl.DITHER);gl.disable(gl.DITHER);terrain.beginReplaceDraw();gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,ctx.screenBuf());gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);ctx.stamps().bindNoise(u.u_wcNoiseTex);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,ctx.paperTex());gl.uniform1i(u.u_paperHeightMap,0);gl.uniform2f(u.u_resolution,field.w,field.h);gl.uniform2f(u.u_paperOrigin,x0/scale,-(y0/scale+field.h));gl.uniform2f(u.u_paperTexSize,size.w/scale,size.h/scale);gl.uniform2f(u.u_paperScale,ctx.paperScale(),ctx.paperScale());gl.drawArrays(gl.TRIANGLES,0,6);terrain.endDraw();if(dither)gl.enable(gl.DITHER);key=next;builds++}
 globalThis.__terrainTex=terrain.texture;gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,terrain.texture);gl.activeTexture(gl.TEXTURE0);return original.apply(this,args)};
 return{stats:()=>({builds,bytes:terrain?terrain.width*terrain.height*16:0}),dispose(){passes.waterFrontStep=original;terrain?.destroy();delete globalThis.__terrainTex;gl.useProgram(null);gl.deleteProgram(prog)}};
}

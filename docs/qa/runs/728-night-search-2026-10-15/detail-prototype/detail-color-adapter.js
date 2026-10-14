import{DISPLAY_VERT,WC_RESAMPLE_FRAG}from'/src/engine/src/raster/shaders.ts';import{createProgram,getUniforms}from'/src/engine/src/raster/utils.ts';
export function install(engine){const gl=engine.gl,passes=engine._watercolorPasses,original=passes.reconstructColor;let draws=0;
let shader=WC_RESAMPLE_FRAG.replace('precision highp float;','precision highp float;uniform sampler2D u_mass;uniform vec4 u_fadeEdges;');
shader=shader.replace('float edge = min(min(q.x - u_clamp.x, u_clamp.z - q.x), min(q.y - u_clamp.y, u_clamp.w - q.y));','float edge = min(min(mix(10000.0,q.x-u_clamp.x,u_fadeEdges.x),mix(10000.0,u_clamp.z-q.x,u_fadeEdges.z)),min(mix(10000.0,q.y-u_clamp.y,u_fadeEdges.y),mix(10000.0,u_clamp.w-q.y,u_fadeEdges.w)));');
const old='gl_FragColor = clamp(base + keep * (wcBilerp(u_src, q) - wcBilerp(u_old, q)), 0.0, 1.0);';
const next=`vec4 n=wcBilerp(u_src,q),o=wcBilerp(u_old,q);
 vec3 baseTau=base.rgb/max(base.a,1.0/255.0),oldTau=o.rgb/max(o.a,1.0/255.0),newTau=n.rgb/max(n.a,1.0/255.0);
 float confidence=smoothstep(2.0/255.0,8.0/255.0,min(base.a,o.a));
 vec3 tau=mix(newTau,baseTau+newTau-oldTau,confidence);
 if(n.a<=0.5/255.0)tau=baseTau;
 tau=clamp(mix(baseTau,tau,keep),0.0,4.0);
 float mass=texture2D(u_mass,gl_FragCoord.xy/u_baseSize).b;
 gl_FragColor=vec4(clamp(tau*mass,0.0,1.0),mass);`;
if(!shader.includes(old))throw Error('Absorption resample source missing');shader=shader.replace(old,next);
const prog=createProgram(gl,DISPLAY_VERT,shader),u=getUniforms(gl,prog,['u_src','u_old','u_base','u_srcSize','u_baseSize','u_dstOrigin','u_srcOrigin','u_ratio','u_mode','u_clamp','u_mass','u_fadeEdges']),pos=gl.getAttribLocation(prog,'a_position');
passes.reconstructColor=function(dst,dx,dy,dw,dh,src,sx,sy,ratio,old,base,clampRect,mass,fadeEdges){if(dw<=0||dh<=0)return;dst.beginReplaceDraw();gl.enable(gl.SCISSOR_TEST);gl.scissor(dx,dy,dw,dh);gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,passes.ctx.screenBuf());gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);for(const[i,name,b]of[[0,'u_src',src],[1,'u_old',old],[2,'u_base',base],[3,'u_mass',mass]]){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(u[name],i)}gl.activeTexture(gl.TEXTURE0);gl.uniform2f(u.u_srcSize,src.width,src.height);gl.uniform2f(u.u_baseSize,base.width,base.height);gl.uniform2f(u.u_dstOrigin,dx,dy);gl.uniform2f(u.u_srcOrigin,sx,sy);gl.uniform1f(u.u_ratio,ratio);gl.uniform1f(u.u_mode,1);gl.uniform4fv(u.u_clamp,clampRect);gl.uniform4fv(u.u_fadeEdges,fadeEdges??[1,1,1,1]);gl.drawArrays(gl.TRIANGLES,0,6);draws++;gl.disable(gl.SCISSOR_TEST);dst.endDraw()};
return{stats:()=>({draws}),dispose(){if(original)passes.reconstructColor=original;else delete passes.reconstructColor;gl.useProgram(null);gl.deleteProgram(prog)}};
}

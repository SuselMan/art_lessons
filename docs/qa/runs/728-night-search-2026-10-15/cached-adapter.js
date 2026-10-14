import { DISPLAY_VERT, WC_BRUSH_DRAG_FRAG } from '/src/engine/src/raster/shaders.ts';
import { createProgram, getUniforms } from '/src/engine/src/raster/utils.ts';
export function install(engine){
 const gl=engine.gl,passes=engine._watercolorPasses;
 const shader=WC_BRUSH_DRAG_FRAG.slice(0,WC_BRUSH_DRAG_FRAG.indexOf('float rawFraction'))+`
 float channelLimit(float q,float cap,float raw){if(q<0.5||raw<=0.0)return 1.0;return min(1.0,cap/(q*raw));}
 float limited(float raw,vec4 P,vec4 C,vec4 targetP,vec4 targetC){
  if(raw<=0.0)return 0.0;
  vec4 roomP=floor((255.0-targetP)/4.0),roomC=floor((255.0-targetC)/4.0);
  float limit=1.0;
  limit=min(limit,channelLimit(P.r,roomP.r,raw));limit=min(limit,channelLimit(P.g,roomP.g,raw));
  limit=min(limit,channelLimit(P.b,roomP.b,raw));limit=min(limit,channelLimit(P.a,roomP.a,raw));
  limit=min(limit,channelLimit(C.r,roomC.r,raw));limit=min(limit,channelLimit(C.g,roomC.g,raw));
  limit=min(limit,channelLimit(C.b,roomC.b,raw));limit=min(limit,channelLimit(C.a,roomC.a,raw));
  return raw*limit;
 }
 void main(){
  vec2 center=snapUV(v_uv);
  vec4 own=floor(texture2D(u_paint,center)*255.0+0.5),result=own;
  vec3 flow=flowAt(center);float water=texture2D(u_water,center).a;
  if(flow.b<=0.0||water<=0.015){gl_FragColor=own/255.0;return;}
  vec4 density=texture2D(u_pigment,center),P=floor(density*255.0+0.5),C=floor(texture2D(u_color,center)*255.0+0.5);
  vec2 velocity=flow.rg*2.0-1.0;
  for(int k=0;k<4;k++){
   vec2 dir=axis(k),neighbour=snapUV(center+dir*u_step);
   if(min(min(neighbour.x,neighbour.y),min(1.0-neighbour.x,1.0-neighbour.y))<0.0)continue;
   vec3 targetFlow=flowAt(neighbour);float doseB=min(flow.b,targetFlow.b);
   if(doseB<=0.0)continue;
   float contact=smoothstep(0.015,0.15,min(water,texture2D(u_water,neighbour).a));
   contact*=step(0.015,texture2D(u_water,(center+neighbour)*0.5).a);
   if(contact<=0.0)continue;
   vec4 targetDensity=texture2D(u_pigment,neighbour),targetP=floor(targetDensity*255.0+0.5),targetC=floor(texture2D(u_color,neighbour)*255.0+0.5);
   float clock=-log(max(1.0-clamp(doseB,0.0,1.0),1.0/255.0));
   float adv=0.3535533905932738*u_contactGain*abs(dot(0.5*(velocity+(targetFlow.rg*2.0-1.0)),dir))*clock;
   float ownMix=0.02*max(density.a-targetDensity.a,0.0)/max(density.a,5e-5);
   float otherMix=0.02*max(targetDensity.a-density.a,0.0)/max(targetDensity.a,5e-5);
   float leave=limited((adv+ownMix*doseB)*contact,P,C,targetP,targetC);
   float enter=limited((adv+otherMix*doseB)*contact,targetP,targetC,P,C);
   result-=floor(own*leave);
   result+=floor(floor(texture2D(u_paint,neighbour)*255.0+0.5)*enter);
  }
  gl_FragColor=result/255.0;
 }`;
 const prog=createProgram(gl,DISPLAY_VERT,shader),old=[passes._brushDragProg,passes._brushDragUni,passes._brushDragPosLoc];
 passes._brushDragProg=prog;passes._brushDragUni=getUniforms(gl,prog,['u_paint','u_flow','u_water','u_pigment','u_step','u_flowRect','u_color','u_contactGain','u_texel']);passes._brushDragPosLoc=gl.getAttribLocation(prog,'a_position');
 return {dispose(){[passes._brushDragProg,passes._brushDragUni,passes._brushDragPosLoc]=old;gl.useProgram(null);gl.deleteProgram(prog)}};
}

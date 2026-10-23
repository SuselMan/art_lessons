import { SMUDGE_PICKUP_FRAG, SMUDGE_TRANSFER_FRAG } from './shaders'

/** Old stump/mixer equations remain behind u_wetEnabled=0. Blur uses a bounded
 * five-tap kernel on the carried premultiplied pigment, never CPU readback. */
export const WET_PICKUP_FRAG = SMUDGE_PICKUP_FRAG
 .replace('uniform float u_rate;', 'uniform float u_wetRetention; uniform float u_wetBlur; uniform vec2 u_wetTexel; uniform float u_rate;')
 .replace('vec4 picked = mix(texture2D(u_carried, v_uv), under, rate);', `
 vec4 carried = texture2D(u_carried, v_uv);
 if (u_wetBlur > 0.0) {
   vec2 d = u_wetTexel * u_wetBlur * 3.0;
   carried = (carried * 4.0 + texture2D(u_carried,v_uv+vec2(d.x,0.0)) + texture2D(u_carried,v_uv-vec2(d.x,0.0)) + texture2D(u_carried,v_uv+vec2(0.0,d.y)) + texture2D(u_carried,v_uv-vec2(0.0,d.y))) / 8.0;
 }
 vec4 picked = mix(carried * u_wetRetention, under, rate);`)
export const WET_TRANSFER_FRAG = SMUDGE_TRANSFER_FRAG
 .replace('uniform float u_hardness;', `uniform float u_hardness;
 uniform sampler2D u_dual; uniform float u_dualKind; uniform float u_dualBlend; uniform vec4 u_dualTransform;
 uniform sampler2D u_wetOriginal; uniform vec4 u_wetRender; uniform float u_wetBlend; uniform float u_burntBlend;
 uniform vec2 u_wetRoundPhase; uniform float u_wetEnabled; uniform float u_tipKind; uniform sampler2D u_tip;
 uniform sampler2D u_wetGrain; uniform float u_grainStrength; uniform float u_grainPeriod;
 uniform float u_grainBlend; uniform vec4 u_grainTransform; uniform vec2 u_grainTone; uniform vec2 u_wetWorldOrigin; uniform vec2 u_flip;`)
 .replace('  void main() {', `
 // Exact small integer Bayer ranks; no float hash, trig, time or frame state.
 float wetRank2(vec2 p) { return 2.0*p.x+3.0*p.y-4.0*p.x*p.y; }
 float wetThreshold(vec2 world) {
   vec2 p=mod(floor(world)+u_wetRoundPhase,8.0);
   float rank=16.0*wetRank2(mod(p,2.0))+4.0*wetRank2(mod(floor(p/2.0),2.0))+wetRank2(floor(p/4.0));
   return (rank+0.5)/64.0;
 }
 float wetGrainBlend(float b,float s,float m) {
   if(m<0.5)return s;
   if(m<1.5)return b*s;
   if(m<2.5)return b+s-b*s;
   if(m<3.5)return b<0.5?2.0*b*s:1.0-2.0*(1.0-b)*(1.0-s);
   if(m<4.5)return min(b,s);
   if(m<5.5)return max(b,s);
   if(m<6.5)return 1.0-min(1.0,(1.0-b)/max(s,0.00392157));
   if(m<7.5)return max(0.0,b+s-1.0);
   if(m<8.5)return min(1.0,b/max(1.0-s,0.00392157));
   if(m<9.5)return min(1.0,b+s);
   if(m<10.5)return max(0.0,b-s);
   if(m<11.5)return abs(b-s);
   return b+s-2.0*b*s;
 }
 void main() {`)
 .replace('if (dist > 1.0) discard;', 'if ((u_wetEnabled < 0.5 || u_tipKind < 0.5) && dist > 1.0) discard;')
 .replace('shape *= 1.0 - exp(-8.0 * (1.0 - dist));', `shape *= 1.0 - exp(-8.0 * (1.0 - dist));
 if (u_wetEnabled > 0.5) {
   if (u_tipKind > 0.5) shape = texture2D(u_tip,v_localUV*u_flip*0.5+0.5).a;
   if (u_dualKind > 0.5) {
     vec2 uv=v_localUV*u_dualTransform.xy;
     uv=mat2(u_dualTransform.z,-u_dualTransform.w,u_dualTransform.w,u_dualTransform.z)*uv;
     float second=u_dualKind>1.5 ? texture2D(u_dual,uv*0.5+0.5).a : 1.0-smoothstep(0.7,1.0,length(uv));
     if (abs(uv.x)>1.0 || abs(uv.y)>1.0) second=0.0;
     shape=wetGrainBlend(shape,second,u_dualBlend);
   }
   if (shape <= 0.0) discard;
   vec2 world = vec2(gl_FragCoord.x + u_wetWorldOrigin.x, u_wetWorldOrigin.y-gl_FragCoord.y);
   vec2 guv = (world + u_grainTransform.xy)/u_grainPeriod;
   guv = mat2(u_grainTransform.z,-u_grainTransform.w,u_grainTransform.w,u_grainTransform.z)*guv;
   float grain = texture2D(u_wetGrain,fract(guv)).a;
   grain = clamp((grain-0.5)*(1.0+u_grainTone.y*3.0)+0.5+u_grainTone.x,0.0,1.0);
   shape = mix(shape,wetGrainBlend(shape,grain,u_grainBlend),u_grainStrength);
 }`)

 .replace('float a = clamp(u_strength * shape * effectiveCatch, 0.0, 1.0);', `
    float amount=u_strength*shape*effectiveCatch;
    if (u_wetEnabled > 0.5) {
      // Mixer has a sequential carried imprint rather than stroke coverage.
      // These density/edge equations approximate the same rendering controls.
      float edge=shape*(1.0-shape)*4.0;
      amount *= 1.0 + u_wetRender.x*edge;
      float density=u_wetRender.z<0.5?0.5:u_wetRender.z<1.5?0.8:u_wetRender.z<2.5?1.5:u_wetRender.z<3.5?2.5:u_wetRender.z<4.5?0.9:u_wetRender.z<5.5?1.8:1.0;
      amount=1.0-pow(1.0-clamp(amount,0.0,1.0),density);
      vec4 base=texture2D(u_wetOriginal,puv);
      vec3 pigment=c.rgb/max(c.a,0.00392157);
      for (int i=0;i<3;i++) pigment[i]=wetGrainBlend(base[i]/max(base.a,0.00392157),pigment[i],u_wetBlend);
      vec3 burnt;
      for (int i=0;i<3;i++) burnt[i]=wetGrainBlend(pigment[i],pigment[i],u_burntBlend);
      pigment=mix(pigment,burnt,clamp(u_wetRender.y*edge,0.0,1.0));
      if(u_wetRender.w>0.5) {
        float lum=dot(pigment,vec3(0.2126,0.7152,0.0722));
        pigment=mix(pigment,vec3(lum),u_wetRender.w);
      }
      c=vec4(pigment*c.a,c.a);
    }
    float a=clamp(amount,0.0,1.0);`)

 .replace('if (u_mode > 0.5) {', `
    if (u_wetEnabled > 0.5) {
      vec4 base=texture2D(u_wetOriginal,puv);
      float tooth=1.0+u_grainRelief*(1.0-c.a)*(paperCatch-0.5)*2.0;
      vec4 result=clamp(base*(1.0-a)+c*tooth*a,0.0,1.0);
      vec2 world=vec2(gl_FragCoord.x+u_wetWorldOrigin.x,u_wetWorldOrigin.y-gl_FragCoord.y);
      // Round once, after the complete lerp; two 8-bit clear/add passes lose
      // every sub-byte wet transfer before it has a chance to accumulate.
      result=floor(result*255.0+wetThreshold(world))/255.0;
      result.rgb=min(result.rgb,vec3(result.a));
      gl_FragColor=result;
      return;
    }
    if (u_mode > 0.5) {`)

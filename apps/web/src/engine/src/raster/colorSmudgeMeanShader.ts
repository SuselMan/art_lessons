/** Mask-weighted Color Smudge sampling, bounded to 1024 taps per attempt.
 * Halton coordinates, 2%/64 initial batch, 16-tap convergence checks and
 * 0.05 radius expansion follow the source mechanisms; RGBA8/max-channel
 * convergence substitutes for native colour-space differenceA. */
export const COLOR_SMUDGE_MEAN_FRAG = `
precision highp float;
uniform sampler2D u_source;
uniform sampler2D u_mask;
uniform vec4 u_geometry; // native width,height,gathered world span,unused
uniform vec4 u_maskMapping; // current-mask offset UV,inverse span,enabled
uniform vec3 u_radius; // requested radius, integer QRect centre relative to source
float inverseRadical(float index,float base) {
  float result=0.0,weight=1.0/base;
  for(int j=0;j<16;j++){
    if(index<0.5)break;
    result+=mod(index,base)*weight;
    index=floor(index/base);weight/=base;
  }
  return result;
}
vec4 straight(vec4 p) { return vec4(p.a>0.0?p.rgb/p.a:vec3(0.0),p.a); }
void main(){
  vec4 mean=vec4(0.0);
  for(int attempt=0;attempt<21;attempt++){
    float radius=min(1.0,u_radius.x+float(attempt)*0.05);
    vec2 inset=ceil(u_geometry.xy*(radius-1.0)*0.5);
    vec2 lo=radius>0.0?min(-inset,u_radius.yz):u_radius.yz;
    vec2 hi=radius>0.0?max(u_geometry.xy+inset,u_radius.yz+1.0):u_radius.yz+1.0;
    vec2 size=hi-lo;
    float pixels=size.x*size.y;
    float initial=min(1024.0,min(pixels,max(64.0,floor(pixels*0.02+0.5))));
    float limit=min(1024.0,pixels);
    vec4 sum=vec4(0.0),last=vec4(0.0);
    float weights=0.0;
    for(int i=0;i<1024;i++){
      float count=float(i+1);
      if(count>limit)break;
      vec2 p=lo+floor(vec2(inverseRadical(count,2.0),inverseRadical(count,3.0))*(size-1.0)+0.5);
      vec4 pixel=texture2D(u_source,vec2((p.x+0.5)/u_geometry.z,1.0-(p.y+0.5)/u_geometry.z));
      vec2 uv=u_maskMapping.xy+(p+0.5)*u_maskMapping.z;
      float weight=u_maskMapping.w>0.5 ? texture2D(u_mask,vec2(uv.x,1.0-uv.y)).a : 1.0;
      sum+=pixel*weight;weights+=weight;
      if(count==initial || count>initial && mod(count-initial,16.0)<0.5 || count==limit){
        mean=weights>0.0?sum/weights:vec4(0.0);
        vec4 difference=abs(straight(mean)-straight(last));
        if(count>initial && max(max(difference.r,difference.g),max(difference.b,difference.a))<=2.0/255.0)break;
        last=mean;
      }
    }
    if(weights>=128.0/255.0 || radius>=1.0)break;
  }
  gl_FragColor=mean;
}
`

/** Private functional89 tree reader. Only the saturation variant includes it;
 * ordinary72 shader bytes stay unchanged. RGBA8/NEAREST, no float extension. */
export const BRISTLE_SATURATION_GLSL=`
uniform sampler2D u_saturation;
uniform vec4 u_satTree; // base, segments, tailStart, metadataRow
uniform vec2 u_satTail; // tailQ, multiplicative
varying highp vec4 v_satParameter; // lower, upper, mix, actual parameter
float satRead(float texel,float row){
 vec4 b=floor(texture2D(u_saturation,vec2((texel+.5)/1024.,(row+.5)/128.))*255.+.5);
 float sign=b.x>=128.?-1.:1.;float e=mod(b.x,128.)*2.+floor(b.y/128.);
 float m=mod(b.y,128.)*65536.+b.z*256.+b.w;
 if(e==0.)return sign*exp2(-126.)*(m/8388608.);
 return sign*exp2(e-127.)*(1.+m/8388608.);
}
float satLog(float q){
 if(u_satTail.y>.5)return q<=0.?-1.e30:v_satParameter.w+log(q);
 float f=v_satParameter.w+q;return f<=0.?-1.e30:log(f);
}
vec2 satConstant(float q,float count){float a=satLog(q)*count;return vec2(a,min(0.,a));}
vec2 satCompose(vec2 a,vec2 b){return vec2(a.x+b.x,min(b.x+a.y,b.y));}
float satEnd(float leaf){return satRead(leaf*2.,u_satTree.w);}
float satQ(float leaf){return satRead(leaf*2.+1.,u_satTree.w);}
float satStart(float leaf){return leaf<.5?1.:satEnd(leaf-1.);}
float satLeaf(float index){
 float lo=0.,hi=u_satTree.y-1.;
 for(int i=0;i<9;i++){if(lo<hi){float mid=floor((lo+hi)*.5);if(index<satEnd(mid))hi=mid;else lo=mid+1.;}}
 return lo;
}
vec2 satNode(float node){
 if(node>=u_satTree.x){float leaf=node-u_satTree.x;return satConstant(satQ(leaf),satEnd(leaf)-satStart(leaf));}
 float texel=(node-1.)*2.;
 vec2 a=vec2(satRead(texel,v_satParameter.x),satRead(texel+1.,v_satParameter.x));
 if(v_satParameter.x==v_satParameter.y)return a;
 vec2 b=vec2(satRead(texel,v_satParameter.y),satRead(texel+1.,v_satParameter.y));
 return mix(a,b,v_satParameter.z);
}
vec2 satInterval(float start,float end){
 vec2 result=vec2(0.);
 if(start<min(end,u_satTree.z)){
  float stop=min(end,u_satTree.z),first=satLeaf(start),last=satLeaf(stop-1.);
  result=satConstant(satQ(first),min(stop,satEnd(first))-start);
  if(first!=last){
   float left=u_satTree.x+first+1.,right=u_satTree.x+last;vec2 a=vec2(0.),b=vec2(0.);
   for(int level=0;level<10;level++){
    if(left<right){
     if(mod(left,2.)>.5){a=satCompose(a,satNode(left));left+=1.;}
     if(mod(right,2.)>.5){right-=1.;b=satCompose(satNode(right),b);}
     left=floor(left*.5);right=floor(right*.5);
    }
   }
   result=satCompose(result,satCompose(a,b));
   result=satCompose(result,satConstant(satQ(last),stop-satStart(last)));
  }
  start=stop;
 }
 if(start<end)result=satCompose(result,satConstant(u_satTail.x,end-start));
 return result;
}
// First factor comes from actual trajectory state, not the preceding curve tap.
vec3 bristleSaturationColor(vec3 rgb,float firstFactor,float counter,float index){
 float hi=max(rgb.r,max(rgb.g,rgb.b)),lo=min(rgb.r,min(rgb.g,rgb.b));
 float light=(hi+lo)*.5,den=1.-abs(hi+lo-1.);
 if(hi==lo||den<=0.)return rgb;
 float initial=(hi-lo)/den,s=min(1.,initial*firstFactor);
 if(s<=0.)return vec3(light);
 if(index>0.){vec2 t=satInterval(counter+1.,counter+index+1.);s=exp(min(0.,min(t.x+log(s),t.y)));}
 return clamp(vec3(light)+(rgb-vec3(light))*(s/initial),0.,1.);
}
`

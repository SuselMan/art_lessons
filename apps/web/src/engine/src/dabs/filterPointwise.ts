/** Canonical shared pointwise law for existing filters and carried147. */
export const FILTER_POINTWISE_GLSL=`// Positive integer trial quotient corrected by exact residual; every product
// is <=255*65535 <2^24, including captured PMA-byte unpremultiplication.
float p117floor(float n,float d){float q=floor(n/d),r=n-q*d;return r<0.?q-1.:(r>=d?q+1.:q);}
float p117nearest(float n,float d){float q=p117floor(n,d),r=n-q*d;return q+(2.*r>=d?1.:0.);}
float p117channel(float u,float m,float h){float q=p117floor(u,m),r=u-q*m;return q*m+(r>h?m:0.);}
vec4 p117posterize(vec4 original,float steps){vec4 bytes=floor(clamp(original,0.,1.)*255.+.5);float a=bytes.a,m=p117floor(65535.,steps),h=floor(m*.5);vec3 u=a>0.?vec3(p117nearest(bytes.r*65535.,a),p117nearest(bytes.g*65535.,a),p117nearest(bytes.b*65535.,a)):vec3(0.);vec4 q=vec4(p117channel(u.r,m,h),p117channel(u.g,m,h),p117channel(u.b,m,h),p117channel(a*257.,m,h))/65535.;return vec4(q.rgb*q.a,q.a);}
uniform vec4 u_noiseSeeds;
uniform vec4 u_noiseSettings;
uniform vec2 u_noiseWorldOrigin;
uniform vec2 u_noiseResolution;
float filterNoiseHash(vec2 p,float seed){
 p=mod(floor(p),4093.0);float x=mod(p.x+seed,4093.0),y=mod(p.y+seed*3.0,4093.0);
 float n=mod(mod(x*x,4093.0)+mod(1237.0*y,4093.0)+mod(seed*31.0,4093.0),4093.0);n=mod(mod(n*n,4093.0)+mod(193.0*x,4093.0)+mod(17.0*y,4093.0),4093.0);return n/4093.0;
}
uniform vec3 u_balanceShadows;
uniform vec3 u_balanceMidtones;
uniform vec3 u_balanceHighlights;
vec4 filterColorBalance(vec4 original,float preserveLuminosity){
 float alpha=original.a;
 vec3 rgb=alpha>0.0?clamp(original.rgb/alpha,0.0,1.0):vec3(0.0);
 float oldLight=(max(max(rgb.r,rgb.g),rgb.b)+min(min(rgb.r,rgb.g),rgb.b))*0.5;
 float shadow=clamp((oldLight-0.333)/-0.25+0.5,0.0,1.0)*0.7;
 float mid=clamp((oldLight-0.333)/0.25+0.5,0.0,1.0)*clamp((oldLight+0.333-1.0)/-0.25+0.5,0.0,1.0)*0.7;
 float high=clamp((oldLight+0.333-1.0)/0.25+0.5,0.0,1.0)*0.7;
 vec3 adjusted=clamp(rgb+u_balanceShadows*shadow+u_balanceMidtones*mid+u_balanceHighlights*high,0.0,1.0);
 if(preserveLuminosity>0.5){
  float lo=min(min(adjusted.r,adjusted.g),adjusted.b),hi=max(max(adjusted.r,adjusted.g),adjusted.b),delta=hi-lo;
  float light=(hi+lo)*0.5,denom=1.0-abs(2.0*light-1.0);
  float saturation=delta>0.0&&denom>0.0?delta/denom:0.0;
  float chroma=(1.0-abs(2.0*oldLight-1.0))*saturation;
  adjusted=delta>0.0?(adjusted-vec3(lo))/delta*chroma+vec3(oldLight-chroma*0.5):vec3(oldLight);
 }
 return vec4(clamp(adjusted,0.0,1.0)*alpha,alpha);
}
vec4 filterPointwise(vec4 original,vec4 settings){
 if(settings.w>6.5){
  vec2 p=u_noiseWorldOrigin+vec2(floor(gl_FragCoord.x),floor(u_noiseResolution.y-gl_FragCoord.y));
  if(filterNoiseHash(p,u_noiseSeeds.x)<=1.0-u_noiseSettings.x)return original;
  float red=floor(filterNoiseHash(p,u_noiseSeeds.y)*255.0)/255.0;
  vec3 color=u_noiseSettings.z>0.5?vec3(red):vec3(red,floor(filterNoiseHash(p,u_noiseSeeds.z)*255.0)/255.0,floor(filterNoiseHash(p,u_noiseSeeds.w)*255.0)/255.0);
  return mix(original,vec4(color,1.0),u_noiseSettings.y);
 }
 if(settings.w>5.5){
  float a=original.a;vec3 rgb=a>0.0?clamp(original.rgb/a,0.0,1.0):vec3(0.0);
  float hi=max(max(rgb.r,rgb.g),rgb.b),lo=min(min(rgb.r,rgb.g),rgb.b),c=hi-lo;
  float factor=settings.x>0.0?1.0+settings.x+2.0*settings.x*settings.x:1.0+settings.x;
  float next=min(hi,min(1.0,c*factor));
  return vec4((c>1e-9?vec3(hi)-(vec3(hi)-rgb)*(next/c):rgb)*a,a);
 }
 if(settings.w>4.5)return filterColorBalance(original,settings.x);
 if(settings.w>3.5)return p117posterize(original,settings.x);
 if(settings.w>2.5){float lo=min(min(original.r,original.g),original.b),hi=max(max(original.r,original.g),original.b);float gray;if(settings.x<.5)gray=(lo+hi)*.5;else if(settings.x<1.5)gray=dot(original.rgb,vec3(.2126,.7152,.0722));else if(settings.x<2.5)gray=dot(original.rgb,vec3(.299,.587,.114));else if(settings.x<3.5)gray=(original.r+original.g+original.b)/3.;else if(settings.x<4.5)gray=lo;else gray=hi;return vec4(vec3(gray),original.a);}
 return vec4(original.aaa-original.rgb,original.a);
}`

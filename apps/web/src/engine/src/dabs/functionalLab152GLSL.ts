/** Shared functional D65 Lab16; exact152 shader functions, not nativeICC byte parity. */
export const FUNCTIONAL_LAB152_GLSL=`vec3 linearRgb(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
float labf(float t){return t>216./24389.?pow(t,1./3.):(24389.*t/27.+16.)/116.;}
vec3 lab16(vec4 p){vec3 c=linearRgb(p.a>0.?clamp(p.rgb/p.a,0.,1.):vec3(0.));float x=labf(dot(c,vec3(.4124564,.3575761,.1804375))/.95047),y=labf(dot(c,vec3(.2126729,.7151522,.072175))),z=labf(dot(c,vec3(.0193339,.119192,.9503041))/1.08883);return floor(clamp(vec3((116.*y-16.)/100.,(500.*(x-y)+128.)/255.,(200.*(y-z)+128.)/255.),0.,1.)*65535.+.5);}
float invf(float t){return t>6./29.?t*t*t:3.*(6./29.)*(6./29.)*(t-4./29.);}
float srgb(float v){return v<=.0031308?12.92*v:1.055*pow(v,1./2.4)-.055;}
vec3 fromLab16(vec3 q){float L=q.x/65535.*100.,a=q.y/65535.*255.-128.,b=q.z/65535.*255.-128.,fy=(L+16.)/116.;vec3 xyz=vec3(.95047*invf(fy+a/500.),invf(fy),1.08883*invf(fy-b/200.));vec3 c=vec3(dot(xyz,vec3(3.2404542,-1.5371385,-.4985314)),dot(xyz,vec3(-.969266,1.8760108,.041556)),dot(xyz,vec3(.0556434,-.2040259,1.0572252)));return clamp(vec3(srgb(c.r),srgb(c.g),srgb(c.b)),0.,1.);}
`

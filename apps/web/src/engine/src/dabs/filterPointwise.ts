/** Canonical shared pointwise law for existing filters and carried147. */
export const FILTER_POINTWISE_GLSL=`// Positive integer trial quotient corrected by exact residual; every product
// is <=255*65535 <2^24, including captured PMA-byte unpremultiplication.
float p117floor(float n,float d){float q=floor(n/d),r=n-q*d;return r<0.?q-1.:(r>=d?q+1.:q);}
float p117nearest(float n,float d){float q=p117floor(n,d),r=n-q*d;return q+(2.*r>=d?1.:0.);}
float p117channel(float u,float m,float h){float q=p117floor(u,m),r=u-q*m;return q*m+(r>h?m:0.);}
vec4 p117posterize(vec4 original,float steps){vec4 bytes=floor(clamp(original,0.,1.)*255.+.5);float a=bytes.a,m=p117floor(65535.,steps),h=floor(m*.5);vec3 u=a>0.?vec3(p117nearest(bytes.r*65535.,a),p117nearest(bytes.g*65535.,a),p117nearest(bytes.b*65535.,a)):vec3(0.);vec4 q=vec4(p117channel(u.r,m,h),p117channel(u.g,m,h),p117channel(u.b,m,h),p117channel(a*257.,m,h))/65535.;return vec4(q.rgb*q.a,q.a);}
vec4 filterPointwise(vec4 original,vec4 settings){
 if(settings.w>3.5)return p117posterize(original,settings.x);
 if(settings.w>2.5){float lo=min(min(original.r,original.g),original.b),hi=max(max(original.r,original.g),original.b);float gray;if(settings.x<.5)gray=(lo+hi)*.5;else if(settings.x<1.5)gray=dot(original.rgb,vec3(.2126,.7152,.0722));else if(settings.x<2.5)gray=dot(original.rgb,vec3(.299,.587,.114));else if(settings.x<3.5)gray=(original.r+original.g+original.b)/3.;else if(settings.x<4.5)gray=lo;else gray=hi;return vec4(vec3(gray),original.a);}
 return vec4(original.aaa-original.rgb,original.a);
}`

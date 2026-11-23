import { SOURCE_F32_ARITHMETIC_BASE4096_GLSL } from './sourceF32ArithmeticBase4096Shader'

/** Inactive GLSL100 candidate for the default generator's NEON-vector route.
 * Controls are canonical finite F32 components. Host must prove vector route,
 * positive effective dimensions, monotonic fade coefficients and finite work.
 * Scalar 3x3/6x6 supersampling is a separate F64 profile, never this function. */
export const SOURCE_DEFAULT_AUTO_VECTOR_GLSL = SOURCE_F32_ARITHMETIC_BASE4096_GLSL + /* glsl */ `
struct SourceAutoVectorControls{
 vec3 centerX;vec3 centerY;vec3 cosine;vec3 sine;
 vec3 xCoefficient;vec3 yCoefficient;vec3 xFade;vec3 yFade;
 float rectangle;float antialias;float width;
};
vec3 savZero(){return vec3(0.0,0.0,-149.0);}
vec3 savOne(){return vec3(0.0,8388608.0,-23.0);}
vec3 savNeg(vec3 v){v.x=1.0-v.x;return v;}
vec3 savAbs(vec3 v){v.x=0.0;return v;}
vec3 savAdd(vec3 a,vec3 b){return sourceAddF32Base4096(a,b).xyz;}
vec3 savMul(vec3 a,vec3 b){return sourceMultiplyF32Base4096(a,b).xyz;}
vec3 savFma(vec3 a,vec3 b,vec3 c){return sourceFmaF32Base4096(a,b,c).xyz;}
bool savLess(vec3 a,vec3 b){
 if(a.y==0.0&&b.y==0.0)return false;
 if(a.x!=b.x)return a.x>0.5;
 bool magnitude=a.z<b.z||(a.z==b.z&&a.y<b.y);
 return a.x>0.5?(a.z>b.z||(a.z==b.z&&a.y>b.y)):magnitude;
}
bool savEqual(vec3 a,vec3 b){return(a.y==0.0&&b.y==0.0)||all(equal(a,b));}
vec3 savIndex(float value){
 if(value==0.0)return savZero();float e=0.0;
 if(value>=65536.0){value/=65536.0;e+=16.0;}
 if(value>=256.0){value/=256.0;e+=8.0;}
 if(value>=16.0){value/=16.0;e+=4.0;}
 if(value>=4.0){value/=4.0;e+=2.0;}
 if(value>=2.0){value/=2.0;e+=1.0;}
 return vec3(0.0,value*8388608.0,e-23.0);
}
vec3 savEstimate(vec3 d){
 // Active fade denominators are positive normal finite F32 values.
 // The odd divisor lies513..1023, so floor's nearest integer separation
 // is >=1/1023, larger than the F32 division rounding error here.
 float bin=256.0+floor((d.y-8388608.0)/32768.0);
 float estimate=floor((floor(524288.0/(bin*2.0+1.0))+1.0)/2.0);
 return vec3(d.x,estimate*32768.0,-47.0-d.z);
}
vec3 savDivide(vec3 n,vec3 d){
 vec3 reciprocal=savEstimate(d);vec3 two=vec3(0.0,8388608.0,-22.0);
 reciprocal=savMul(reciprocal,savFma(savNeg(d),reciprocal,two));
 reciprocal=savMul(reciprocal,savFma(savNeg(d),reciprocal,two));
 return savMul(n,reciprocal);
}
float savAlpha(vec3 fade,float x,float width){
 vec3 alpha=savMul(savAdd(savOne(),savNeg(fade)),vec3(0.0,16711680.0,-16.0));
 int shift=-int(alpha.z);float q=0.0;
 if(shift<25){
  if(shift<0){q=alpha.y*s12pow(-shift);}
  else{
   int lowerShift=shift/2;float power=s12pow(lowerShift)*s12pow(shift-lowerShift);
   q=floor(alpha.y/power);float remainder=alpha.y-q*power;
   if(x<floor(width/4.0)*4.0&&(remainder>power*0.5||(remainder==power*0.5&&mod(q,2.0)>0.0)))q+=1.0;
  }
 }
 if(alpha.x>0.5)q=-q;return mod(q,256.0);
}
float sourceDefaultAutoVectorCoverage(vec2 pixel,SourceAutoVectorControls k){
 vec3 px=savAdd(savIndex(pixel.x),savNeg(k.centerX));
 vec3 py=savAdd(savIndex(pixel.y),savNeg(k.centerY));
 vec3 sinY=savMul(k.sine,py);vec3 cosY=savMul(k.cosine,py);
 vec3 rx=k.rectangle>0.5?savAdd(savMul(px,k.cosine),savNeg(sinY)):savFma(px,k.cosine,savNeg(sinY));
 vec3 ry=savFma(px,k.sine,cosY);
 if(k.rectangle>0.5){
  rx=savAbs(rx);ry=savAbs(ry);
  vec3 nx=savMul(rx,k.xCoefficient);vec3 ny=savMul(ry,k.yCoefficient);
  if(savLess(savOne(),nx)||savLess(savOne(),ny))return 0.0;
  if(k.antialias>0.5){rx=savAdd(rx,savOne());ry=savAdd(ry,savOne());}
  vec3 fx=savMul(rx,k.xFade);vec3 fy=savMul(ry,k.yFade);
  bool activeX=savLess(savOne(),fx);bool activeY=savLess(savOne(),fy);
  vec3 a=savZero();vec3 b=savZero();
  if(activeX)a=savDivide(savMul(nx,savAdd(fx,savNeg(savOne()))),savAdd(fx,savNeg(nx)));
  if(activeY)b=savDivide(savMul(ny,savAdd(fy,savNeg(savOne()))),savAdd(fy,savNeg(ny)));
  // Source compares RAW unmasked fxnorm. With monotonic fades, inactive
  // fxnorm is nonpositive except0/0 NaN; native NaN comparison is false.
  bool rawANan=savEqual(fx,nx)&&(nx.y==0.0||savEqual(nx,savOne()));
  vec3 fade=a;
  if(activeY&&((activeX&&savLess(a,b))||(!activeX&&!rawANan)))fade=b;
  return savAlpha(fade,pixel.x,k.width);
 }
 vec3 nx=savMul(rx,k.xCoefficient);vec3 ny=savMul(ry,k.yCoefficient);
 vec3 radius=savFma(nx,nx,savMul(ny,ny));
 if(savLess(savOne(),radius))return 0.0;
 if(k.antialias>0.5){rx=savAdd(savAbs(rx),savOne());ry=savAdd(savAbs(ry),savOne());}
 nx=savMul(rx,k.xFade);ny=savMul(ry,k.yFade);
 vec3 fadeRadius=savFma(nx,nx,savMul(ny,ny));
 if(savLess(fadeRadius,savOne()))return 255.0;
 vec3 denominator=savAdd(fadeRadius,savNeg(radius));
 // Only0/0 remains after the two masks. Native conversion of NaN yields0.
 if(denominator.y==0.0)return 0.0;
 vec3 numerator=savMul(radius,savAdd(fadeRadius,savNeg(savOne())));
 return savAlpha(savDivide(numerator,denominator),pixel.x,k.width);
}
`

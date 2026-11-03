/** Functional U8 alpha laws matching canonicalMaskingBlendU8. Uniform-selected
 * operation; input bytes/strength are recorded DATA, never shader RNG. */
export const CANONICAL_MASKING_BLEND_GLSL=`
highp float maskingMul(highp float a,highp float b){highp float n=a*b+128.0;return floor((n+floor(n/256.0))/256.0);}
highp float maskingUnion(highp float a,highp float b){return a+b-maskingMul(a,b);}
highp float maskingClamp(highp float a){return clamp(floor(a+0.5),0.0,255.0);}
highp float canonicalMaskingBlend(highp float mode,highp float mask,highp float paint,highp float strength,highp float soft){
 bool hasStrength=strength>=0.0;
 if(mode<0.5&&hasStrength&&soft<0.5){highp float n=paint*mask*strength+32603.0;return floor((n+floor(n/128.0))/65536.0);}
 if(mode>9.5){
  bool photoshop=mode>11.5;bool linear=(mode>10.5&&mode<11.5)||mode>12.5;
  highp float s=photoshop?strength:floor(0.99*strength+0.5);
  highp float inverse=255.0-s;
  highp float source=soft>0.5?maskingMul(mask,s):mask;
  highp float destination=photoshop?paint*(soft>0.5?1.0+9.0*s/255.0:10.0*s/255.0):floor(paint*255.0/inverse)-(soft>0.5?0.0:inverse);
  highp float height=destination-source;
  return maskingClamp(linear?max(destination*(255.0-source)/255.0,height):height);
 }
 highp float src=mask;highp float dst=paint;
 if(hasStrength){
  if(mode>8.5)return max(0.0,soft>0.5?paint-maskingMul(mask,strength):paint-mask-(255.0-strength));
  if(soft>0.5)src=(mode>2.5&&mode<3.5)||(mode>5.5&&mode<6.5)||(mode>7.5&&mode<8.5)?maskingMul(mask,strength):maskingUnion(mask,255.0-strength);
  else dst=maskingMul(paint,strength);
 }
 if(mode<0.5)return maskingMul(src,dst);
 if(mode<1.5)return min(src,dst);
 if(mode<2.5)return dst<128.0?maskingMul(2.0*dst,src):255.0-maskingMul(2.0*(255.0-dst),255.0-src);
 if(mode<3.5)return src==255.0?(dst==0.0?0.0:255.0):min(255.0,floor(dst*255.0/(255.0-src)));
 if(mode<4.5)return src==0.0?(dst==255.0?255.0:0.0):255.0-min(255.0,floor((255.0-dst)*255.0/src));
 if(mode<5.5)return max(0.0,src+dst-255.0);
 if(mode<6.5)return paint==0.0?0.0:min(255.0,src+dst);
 if(mode<7.5){highp float result=src+dst<255.0?0.0:255.0;return hasStrength&&soft>0.5?maskingMul(result,maskingUnion(paint,strength)):result;}
 if(mode<8.5)return maskingClamp(3.0*dst-2.0*(255.0-src));
 return max(0.0,dst-src);
}
`;

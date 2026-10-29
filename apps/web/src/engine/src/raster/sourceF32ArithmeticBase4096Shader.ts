import { SOURCE_FMA_F32_BASE4096_GLSL } from './sourceFmaF32Base4096Shader'

/** Inactive finite component arithmetic candidate. Dedicated 48-bit product /
 * 32-bit add windows avoid generic80-bit FMA expansion for non-fused operators.
 * Same canonical components/result classes as the independent FMA primitive. */
export const SOURCE_F32_ARITHMETIC_BASE4096_GLSL = SOURCE_FMA_F32_BASE4096_GLSL + /* glsl */ `
float sa4get(float a[4],int n){float v=0.0;for(int i=0;i<4;i++){if(i==n)v=a[i];}return v;}
int sa4top(float a[4]){
 int limb=-1;float v=0.0;for(int i=0;i<4;i++){if(a[i]!=0.0){limb=i;v=a[i];}}
 if(limb<0)return -1;int b=0;
 if(v>=64.0){v=floor(v/64.0);b+=6;}if(v>=8.0){v=floor(v/8.0);b+=3;}
 if(v>=4.0){v=floor(v/4.0);b+=2;}if(v>=2.0)b++;
 return limb*12+b;
}
float sa4bit(float a[4],int n){if(n<0||n>=48)return 0.0;int q=n/12;return mod(floor(sa4get(a,q)/s12pow(n-q*12)),2.0);}
void sa4align(float a[4],int shift,out float z[4],out float tail){
 tail=0.0;
 if(shift<0){
  int drop=-shift;int whole=drop/12;int rest=drop-whole*12;float p=s12pow(rest);
  for(int i=0;i<4;i++){if(i<whole&&a[i]!=0.0)tail=1.0;}
  if(mod(sa4get(a,whole),p)!=0.0)tail=1.0;
  for(int i=0;i<4;i++){z[i]=floor(sa4get(a,i+whole)/p)+mod(sa4get(a,i+whole+1),p)*(4096.0/p);}
 }else{
  int whole=shift/12;int rest=shift-whole*12;float p=s12pow(rest);
  for(int i=0;i<4;i++){float lo=sa4get(a,i-whole)*p;float hi=sa4get(a,i-whole-1)*p;z[i]=mod(lo,4096.0)+floor(hi/4096.0);}
 }
}
vec4 sa4finish(float r[4],int exponent,float negative,float discarded){
 int top=sa4top(r);if(top<0)return vec4(negative,0.0,-149.0,0.0);
 int physicalTop=top+exponent;int shift=physicalTop< -126?-149-exponent:top-23;
 float qr[4];float dropped;sa4align(r,-shift,qr,dropped);
 float q=qr[0]+qr[1]*4096.0;float guard=sa4bit(r,shift-1);float sticky=discarded;
 if(shift>0){int whole=(shift-1)/12;int rest=(shift-1)-whole*12;for(int i=0;i<4;i++){if(i<whole&&r[i]!=0.0)sticky=1.0;}if(mod(sa4get(r,whole),s12pow(rest))!=0.0)sticky=1.0;}
 if(guard>0.0&&(sticky>0.0||mod(q,2.0)>0.0))q+=1.0;
 if(physicalTop< -126)return vec4(negative,q,-149.0,0.0);
 if(q==16777216.0){q=8388608.0;physicalTop++;}
 if(physicalTop>127)return vec4(negative,0.0,0.0,1.0);
 return vec4(negative,q,float(physicalTop-23),0.0);
}
vec4 sourceMultiplyF32Base4096(vec3 a,vec3 b){
 float negative=abs(a.x-b.x);
 if(a.y==0.0||b.y==0.0)return vec4(negative,0.0,-149.0,0.0);
 float p[4];float a0=mod(a.y,4096.0);float a1=floor(a.y/4096.0);
 float b0=mod(b.y,4096.0);float b1=floor(b.y/4096.0);
 float v=a0*b0;p[0]=mod(v,4096.0);float carry=floor(v/4096.0);
 v=a1*b0+carry;p[1]=mod(v,4096.0);p[2]=floor(v/4096.0);
 v=a0*b1+p[1];p[1]=mod(v,4096.0);carry=floor(v/4096.0);
 v=a1*b1+p[2]+carry;p[2]=mod(v,4096.0);p[3]=floor(v/4096.0);
 return sa4finish(p,int(a.z+b.z),negative,0.0);
}
vec4 sourceAddF32Base4096(vec3 a,vec3 b){
 if(a.y==0.0&&b.y==0.0)return vec4(a.x*b.x,0.0,-149.0,0.0);
 if(a.y==0.0)return vec4(b,0.0);if(b.y==0.0)return vec4(a,0.0);
 float p[4];float z[4];float pa[4];float za[4];float r[4];
 for(int i=0;i<4;i++){p[i]=0.0;z[i]=0.0;}
 p[0]=mod(a.y,4096.0);p[1]=floor(a.y/4096.0);
 z[0]=mod(b.y,4096.0);z[1]=floor(b.y/4096.0);
 int physicalA=sa4top(p)+int(a.z);int physicalB=sa4top(z)+int(b.z);
 int exponent=(physicalA>physicalB?physicalA:physicalB)-31;
 float ta;float tb;sa4align(p,int(a.z)-exponent,pa,ta);sa4align(z,int(b.z)-exponent,za,tb);
 float negative=a.x;
 if(a.x==b.x){float carry=0.0;for(int i=0;i<4;i++){float v=pa[i]+za[i]+carry;r[i]=mod(v,4096.0);carry=floor(v/4096.0);}}
 else{
  float comparison=0.0;for(int j=0;j<4;j++){int i=3-j;if(comparison==0.0)comparison=sign(sa4get(pa,i)-sa4get(za,i));}
  if(comparison==0.0)return vec4(0.0,0.0,-149.0,0.0);
  if(comparison<0.0)negative=b.x;
  float borrow=0.0;for(int i=0;i<4;i++){float hi=comparison>0.0?pa[i]:za[i];float lo=comparison>0.0?za[i]:pa[i];float v=hi-lo-borrow;borrow=v<0.0?1.0:0.0;r[i]=v+borrow*4096.0;}
 }
 float discarded=max(ta,tb);float tailNegative=ta>0.0?a.x:b.x;
 if(discarded>0.0&&tailNegative!=negative){float borrow=1.0;for(int i=0;i<4;i++){float v=r[i]-borrow;borrow=v<0.0?1.0:0.0;r[i]=v+borrow*4096.0;}}
 return sa4finish(r,exponent,negative,discarded);
}
`

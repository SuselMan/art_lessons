/** Isolated GLSL100 finite-F32 FMA candidate. Component API preserves subnormal
 * values without numeric float reconstruction. GPU proof/performance pending. */
export const SOURCE_FMA_F32_BASE4096_GLSL = /* glsl */ `
float s12pow(int n){float p=1.0;for(int i=0;i<12;i++){if(i<n)p*=2.0;}return p;}
float s12get(float a[7],int n){float v=0.0;for(int i=0;i<7;i++){if(i==n)v=a[i];}return v;}
int s12top(float a[7]){
 int limb=-1;float v=0.0;for(int i=0;i<7;i++){if(a[i]!=0.0){limb=i;v=a[i];}}
 if(limb<0)return -1;int b=0;
 if(v>=64.0){v=floor(v/64.0);b+=6;}if(v>=8.0){v=floor(v/8.0);b+=3;}
 if(v>=4.0){v=floor(v/4.0);b+=2;}if(v>=2.0)b++;
 return limb*12+b;
}
float s12bit(float a[7],int n){if(n<0||n>=84)return 0.0;int q=n/12;return mod(floor(s12get(a,q)/s12pow(n-q*12)),2.0);}
void s12align(float a[7],int shift,out float z[7],out float tail){
 tail=0.0;
 if(shift<0){
  int drop=-shift;int whole=drop/12;int rest=drop-whole*12;float p=s12pow(rest);
  for(int i=0;i<7;i++){if(i<whole&&a[i]!=0.0)tail=1.0;}
  if(mod(s12get(a,whole),p)!=0.0)tail=1.0;
  for(int i=0;i<7;i++){z[i]=floor(s12get(a,i+whole)/p)+mod(s12get(a,i+whole+1),p)*(4096.0/p);}
 }else{
  int whole=shift/12;int rest=shift-whole*12;float p=s12pow(rest);
  for(int i=0;i<7;i++){float lo=s12get(a,i-whole)*p;float hi=s12get(a,i-whole-1)*p;z[i]=mod(lo,4096.0)+floor(hi/4096.0);}
 }
}
vec4 sourceFmaF32Base4096(vec3 a,vec3 b,vec3 c){
 float p[7];float z[7];float pa[7];float za[7];float r[7];
 for(int i=0;i<7;i++){p[i]=0.0;z[i]=0.0;}
 float a0=mod(a.y,4096.0);float a1=floor(a.y/4096.0);
 float b0=mod(b.y,4096.0);float b1=floor(b.y/4096.0);
 float v=a0*b0;p[0]=mod(v,4096.0);float carry=floor(v/4096.0);
 v=a1*b0+carry;p[1]=mod(v,4096.0);p[2]=floor(v/4096.0);
 v=a0*b1+p[1];p[1]=mod(v,4096.0);carry=floor(v/4096.0);
 v=a1*b1+p[2]+carry;p[2]=mod(v,4096.0);p[3]=floor(v/4096.0);
 z[0]=mod(c.y,4096.0);z[1]=floor(c.y/4096.0);
 int pt=s12top(p);int ct=s12top(z);float pn=abs(a.x-b.x);
 if(pt<0&&ct<0)return vec4(pn*c.x,0.0,-149.0,0.0);
 int pe=int(a.z+b.z);int ce=int(c.z);
 int physicalP=pt<0?-1000:pt+pe;int physicalC=ct<0?-1000:ct+ce;
 int exponent=(physicalP>physicalC?physicalP:physicalC)-79;
 float tp;float tz;s12align(p,pe-exponent,pa,tp);s12align(z,ce-exponent,za,tz);
 float negative=pn;
 if(pn==c.x){
  carry=0.0;for(int i=0;i<7;i++){v=pa[i]+za[i]+carry;r[i]=mod(v,4096.0);carry=floor(v/4096.0);}
 }else{
  float comparison=0.0;for(int j=0;j<7;j++){int i=6-j;if(comparison==0.0)comparison=sign(s12get(pa,i)-s12get(za,i));}
  if(comparison==0.0)return vec4(0.0,0.0,-149.0,0.0);
  if(comparison<0.0)negative=c.x;
  float borrow=0.0;for(int i=0;i<7;i++){float hi=comparison>0.0?pa[i]:za[i];float lo=comparison>0.0?za[i]:pa[i];v=hi-lo-borrow;borrow=v<0.0?1.0:0.0;r[i]=v+borrow*4096.0;}
 }
 float discarded=max(tp,tz);float tailNegative=tp>0.0?pn:c.x;
 if(discarded>0.0&&tailNegative!=negative){float borrow=1.0;for(int i=0;i<7;i++){v=r[i]-borrow;borrow=v<0.0?1.0:0.0;r[i]=v+borrow*4096.0;}}
 int top=s12top(r);if(top<0)return vec4(negative,0.0,-149.0,0.0);
 int physicalTop=top+exponent;int shift=physicalTop< -126?-149-exponent:top-23;
 float qr[7];float dropped;s12align(r,-shift,qr,dropped);
 float q=qr[0]+qr[1]*4096.0;
 // The quotient has at most24 bits. Guard/sticky are read from the ORIGINAL
 // aligned window; the retained discarded signed tail has already borrowed.
 float guard=s12bit(r,shift-1);float sticky=discarded;
 if(shift>0){int whole=(shift-1)/12;int rest=(shift-1)-whole*12;for(int i=0;i<7;i++){if(i<whole&&r[i]!=0.0)sticky=1.0;}if(mod(s12get(r,whole),s12pow(rest))!=0.0)sticky=1.0;}
 if(guard>0.0&&(sticky>0.0||mod(q,2.0)>0.0))q+=1.0;
 if(physicalTop< -126)return vec4(negative,q,-149.0,0.0);
 if(q==16777216.0){q=8388608.0;physicalTop++;}
 if(physicalTop>127)return vec4(negative,0.0,0.0,1.0);
 return vec4(negative,q,float(physicalTop-23),0.0);
}
`

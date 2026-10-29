/** Expensive diagnostic finite-FMA components primitive; no renderer hooks.
 * Inputs vec3(negative0or1, significand24, exponent), canonical finite F32.
 * Result vec4(negative,significand,exponent,class): class0 finite,1 overflow.
 * Signed zero is explicit. Never carry raw U32 bits in a highp float.
 * Arithmetic proof: sourceFmaF32Model.provenance.md. GPU gate is separate. */
export const SOURCE_FMA_F32_GLSL=/* glsl */`
float sfmaPow(int n){float v=1.0;for(int i=0;i<8;i++){if(i<n)v*=2.0;}return v;}
float sfmaGet(float a[11],int n){float v=0.0;for(int i=0;i<11;i++){if(i==n)v=a[i];}return v;}
float sfmaBit(float a[11],int n){if(n<0||n>=88)return 0.0;int q=n/8;return mod(floor(sfmaGet(a,q)/sfmaPow(n-q*8)),2.0);}
float sfmaTail(float a[11],int shift){float tail=0.0;for(int i=0;i<6;i++){int n=i*8+shift;if(n<0){if(n<=-8){if(a[i]!=0.0)tail=1.0;}else if(mod(a[i],sfmaPow(-n))!=0.0)tail=1.0;}}return tail;}
void sfmaAlign(float a[11],int shift,out float z[11]){
 int byteShift=int(floor(float(shift)/8.0));int rest=shift-byteShift*8;float power=sfmaPow(rest);
 for(int i=0;i<11;i++){float low=sfmaGet(a,i-byteShift)*power;float high=sfmaGet(a,i-byteShift-1)*power;z[i]=mod(low,256.0)+floor(high/256.0);}
}
vec4 sourceFmaF32(vec3 a,vec3 b,vec3 c){
 float x[3];float y[3];float p[11];float z[11];float pa[11];float za[11];float r[11];
 float ax=a.y;float by=b.y;float cz=c.y;
 for(int i=0;i<3;i++){x[i]=mod(ax,256.0);y[i]=mod(by,256.0);ax=floor(ax/256.0);by=floor(by/256.0);}
 for(int i=0;i<11;i++){p[i]=0.0;z[i]=0.0;}
 for(int i=0;i<3;i++){for(int j=0;j<3;j++){p[i+j]+=x[i]*y[j];}}
 for(int i=0;i<5;i++){float q=floor(p[i]/256.0);p[i]-=q*256.0;p[i+1]+=q;}
 for(int i=0;i<3;i++){z[i]=mod(cz,256.0);cz=floor(cz/256.0);}
 int pt=-1;int ct=-1;
 for(int i=0;i<48;i++){if(sfmaBit(p,i)!=0.0)pt=i;if(sfmaBit(z,i)!=0.0)ct=i;}
 float pn=abs(a.x-b.x);
 if(pt<0&&ct<0)return vec4(pn*c.x,0.0,-149.0,0.0);
 int pe=int(a.z+b.z);int ce=int(c.z);int physicalP=pt<0?-1000:pt+pe;int physicalC=ct<0?-1000:ct+ce;
 int exponent=(physicalP>physicalC?physicalP:physicalC)-79;
 sfmaAlign(p,pe-exponent,pa);sfmaAlign(z,ce-exponent,za);
 float tp=sfmaTail(p,pe-exponent);float tz=sfmaTail(z,ce-exponent);float discarded=max(tp,tz);
 float negative=pn;
 if(pn==c.x){float carry=0.0;for(int i=0;i<11;i++){float sum=pa[i]+za[i]+carry;r[i]=mod(sum,256.0);carry=floor(sum/256.0);}}
 else {
  float comparison=0.0;for(int j=0;j<11;j++){int i=10-j;if(comparison==0.0)comparison=sign(sfmaGet(pa,i)-sfmaGet(za,i));}
  if(comparison==0.0)return vec4(0.0,0.0,-149.0,0.0);
  if(comparison<0.0)negative=c.x;
  float borrow=0.0;for(int i=0;i<11;i++){float hi=comparison>0.0?pa[i]:za[i];float lo=comparison>0.0?za[i]:pa[i];float d=hi-lo-borrow;borrow=d<0.0?1.0:0.0;r[i]=d+borrow*256.0;}
 }
 float tailNegative=tp>0.0?pn:c.x;
 if(discarded>0.0&&tailNegative!=negative){float borrow=1.0;for(int i=0;i<11;i++){float d=r[i]-borrow;borrow=d<0.0?1.0:0.0;r[i]=d+borrow*256.0;}}
 int top=-1;for(int i=0;i<88;i++){if(sfmaBit(r,i)>0.0)top=i;}
 if(top<0)return vec4(negative,0.0,-149.0,0.0);
 int physicalTop=top+exponent;int shift=physicalTop< -126?-149-exponent:top-23;
 float q=0.0;for(int j=0;j<88;j++){int i=87-j;if(i<=top&&i>=(shift>0?shift:0))q=q*2.0+sfmaBit(r,i);}
 // Negative shift can only occur in the full baseline, not the80-bit window.
 float sticky=discarded;for(int i=0;i<88;i++){if(i<shift-1)sticky=max(sticky,sfmaBit(r,i));}
 float guard=sfmaBit(r,shift-1);if(guard>0.0&&(sticky>0.0||mod(q,2.0)>0.0))q+=1.0;
 if(physicalTop< -126)return vec4(negative,q,-149.0,0.0);
 if(q==16777216.0){q=8388608.0;physicalTop++;}
 if(physicalTop>127)return vec4(negative,0.0,0.0,1.0);
 return vec4(negative,q,float(physicalTop-23),0.0);
}
`;

/** Diagnostic exact RGB FMA->F32->RNEbyte specialization. Caller validates
 * t in[0,2], byte channels, and parts=(sign,sig24,exp) for the SAME F32 t.
 * Share coefficient decomposition across all3 channels. No rawU32 float or
 * general80bit FMA normalization; alpha still uses its separate exact kernel.
 * Derivation/native proof: sourceRgbFmaByteModel.provenance.md. */
export const SOURCE_RGB_FMA_BYTE_GLSL=/* glsl */`
float srgbPower(int n){
 bool neg=n<0;int q=neg?-n:n;float v=1.0;
 if(q>=32){v*=neg?2.3283064365386963e-10:4294967296.0;q-=32;}
 if(q>=16){v*=neg?0.0000152587890625:65536.0;q-=16;}
 if(q>=8){v*=neg?0.00390625:256.0;q-=8;}
 if(q>=4){v*=neg?0.0625:16.0;q-=4;}
 if(q>=2){v*=neg?0.25:4.0;q-=2;}
 if(q>=1)v*=neg?0.5:2.0;
 return v;
}
int srgbTop(float a[5]){int top=-1;for(int i=0;i<5;i++){float power=1.0;for(int j=0;j<8;j++){if(a[i]>=power)top=i*8+j;power*=2.0;}}return top;}
vec2 srgbNormalized(float a[5],int top){
 float hi=a[4]*65536.0+a[3]*256.0+a[2];float lo=a[1]*256.0+a[0];int shift=top-23;
 if(shift>=0){float power=srgbPower(shift),scale=srgbPower(16-shift);return vec2(floor(hi*scale)+floor(lo/power),mod(lo,power)*scale);}
 return vec2((hi*65536.0+lo)*srgbPower(-shift),0.0);
}
float srgbRound(float v){float lo=floor(v),fraction=v-lo;return fraction<0.5?lo:fraction>0.5?lo+1.0:lo+mod(lo,2.0);}
bool srgbAbove(float k,float destination,bool pNegative,int pPhysical,vec2 pNorm){
 float odd=mod(k,2.0);float mid=abs(2.0*k+1.0);int midTop=0;
 for(int i=0;i<10;i++){if(mid>=srgbPower(i))midTop=i;}
 int shift=24-midTop,whole=shift/8,rest=shift-whole*8;
 float coefficient=2.0*(k-destination)+1.0;bool nNegative=coefficient<0.0;float magnitude=abs(coefficient);
 float low=mod(magnitude,256.0),high=floor(magnitude/256.0),power=srgbPower(rest);float n[5];
 for(int i=0;i<5;i++){int digit=i-whole;n[i]=(digit==0?low:digit==1?high:0.0)*power;}
 for(int i=0;i<4;i++){float q=floor(n[i]/256.0);n[i]=mod(n[i],256.0);n[i+1]+=q;}
 float residual=(odd==0.0?1.0:-1.0)*(nNegative?-1.0:1.0);
 for(int i=0;i<5;i++){if(residual!=0.0){float q=n[i]+residual;if(q<0.0){n[i]=255.0;residual=-1.0;}else if(q>=256.0){n[i]=0.0;residual=1.0;}else{n[i]=q;residual=0.0;}}}
 int nTop=srgbTop(n),nPhysical=nTop+midTop-25;vec2 nNorm=srgbNormalized(n,nTop);float cmp;
 if(pNegative!=nNegative)cmp=pNegative?-1.0:1.0;
 else {cmp=pPhysical!=nPhysical?(pPhysical>nPhysical?1.0:-1.0):pNorm.x!=nNorm.x?sign(pNorm.x-nNorm.x):sign(pNorm.y-nNorm.y);if(pNegative)cmp=-cmp;}
 return cmp>0.0||(cmp==0.0&&odd==1.0);
}
float sourceRgbFmaByte(float t,vec3 parts,float source,float destination){
 float difference=source-destination;if(difference==0.0||parts.y==0.0)return destination;
 float diff=abs(difference),sig=parts.y,carry=0.0;float p[5];
 for(int i=0;i<3;i++){float digit=mod(sig,256.0),total=digit*diff+carry;p[i]=mod(total,256.0);carry=floor(total/256.0);sig=floor(sig/256.0);}p[3]=carry;p[4]=0.0;
 int pTop=srgbTop(p),pPhysical=pTop+int(parts.z);vec2 pNorm=srgbNormalized(p,pTop);
 float product=t*difference;float approx=product+destination;float candidate=srgbRound(approx);bool negative=difference<0.0;
 float result=srgbAbove(candidate,destination,negative,pPhysical,pNorm)?candidate+1.0:!srgbAbove(candidate-1.0,destination,negative,pPhysical,pNorm)?candidate-1.0:candidate;
 return mod(result,256.0);
}
vec3 sourceRgbFmaBytes(float t,vec3 parts,vec3 source,vec3 destination){return vec3(sourceRgbFmaByte(t,parts,source.r,destination.r),sourceRgbFmaByte(t,parts,source.g,destination.g),sourceRgbFmaByte(t,parts,source.b,destination.b));}
`;

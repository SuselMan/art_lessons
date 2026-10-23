import json,math,struct,random
from pathlib import Path
p=Path(__file__).parent;f=lambda x:struct.unpack('f',struct.pack('f',x))[0]
def poly(y,c):
 y=f(y);x=f(f(f(2*y)/f(math.log(50)))-1);b1=b2=0.
 for a in c[:0:-1]:
  tmp=f(f(f(f(2*x)*b1)-b2)+f(a));b2=b1;b1=tmp
 return max(0,f(f(f(f(x*b1)-b2)+f(c[0]))*y))
def km(k,q,d):
 L=f(k*d);Q=f(q*d)
 if L<=0:R=f(Q/f(1+Q));T=f(1/f(1+Q))
 else:
  H=f(math.sqrt(f(L*f(L+f(2*Q)))));E=f(math.exp(-H));Z=f(f(f(2*H)*f(f(1-H)+f(f(.666666667*H)*H)))) if H<.001 else f(1-f(E*E));D=f(f(f(L+Q)*Z)+f(H*f(1+f(E*E))));R=f(f(Q*Z)/D);T=f(f(f(2*H)*E)/D)
 raw=f(R+f(f(T*T)/max(f(1-R),f(.000001))));return max(0,min(1,raw)),raw
fits=json.loads((p/'cpu-fit-proof.json').read_text())['fits'];rows=[]
for Q in [1,2]:
 c=next(x['coeffChebyshevAscending'] for x in fits if x['Qref']==Q and x['degree']==16);err=0;over=0;zeroerr=0
 for i in range(10001):
  y=f(math.log(50)*i/10000);k=poly(y,c);r,raw=km(k,Q,1);err=max(err,abs(r-math.exp(-y)));over=max(over,max(raw-1,-raw,0))
 for d in [0,.000001,.01,1,10,100,1000]:
  r,raw=km(0,Q,d);zeroerr=max(zeroerr,abs(r-1));over=max(over,max(raw-1,-raw,0))
 rows.append({'Qref':Q,'global10001FullShaderFloat32ReferenceError':err,'whiteK0Mass0to1000MaxError':zeroerr,'rawRangeOvershootBeforeClamp':over,'clampedBounds':'0..1 by shader clamp','formula':'Every elementary arithmetic operation explicit float32, sqrt/exp nearest float32; no FMA. Actual GPU requires compile/render.'})
(p/'full-float32-proof.json').write_text(json.dumps(rows,indent=2));print(rows)

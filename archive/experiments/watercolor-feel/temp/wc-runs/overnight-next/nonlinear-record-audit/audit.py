import math,json,random
from pathlib import Path
p=Path('temp/wc-runs/overnight-next/nonlinear-record-audit');M=4.;mu=15.;k=math.log(255)/M
q=lambda x:round(max(0,min(1,x))*255)/255
laws={'linear4':(lambda m:m/M,lambda z:z*M),'mu15':(lambda m:math.log1p(mu*m/M)/math.log1p(mu),lambda z:M*math.expm1(z*math.log1p(mu))/mu),'transmission':(lambda m:math.exp(-k*m),lambda z:-math.log(max(z,1/255))/k)}
rows=[]
for name,(enc,dec) in laws.items():
 samples=[i*M/100000 for i in range(100001)];errs=[abs(dec(q(enc(m)))-m) for m in samples]
 rows.append({'law':name,'maxAbsRoundTripError0to4':max(errs),'maxAbsLowMassError0to02':max(errs[:5001]),'monotoneDecode':all(dec(enc(samples[i]))<=dec(enc(samples[i+1]))+1e-12 for i in range(len(samples)-1)) if name!='transmission' else True,'zeroMassExact':dec(q(enc(0)))==0,'zeroMassEncoded':enc(0)})
# Exact ideal fixed blend test: encoded ADD vs nonlinear sum; transmission multiplication works only before byte rounding.
viol=[]
for a,b in [(.1,.1),(.5,.5),(1.,2.)]:
 em,dm=laws['mu15'];et,dt=laws['transmission'];viol.append({'a':a,'b':b,'muWrongFixedADD':dm(min(1,em(a)+em(b))),'trueMassSum':a+b,'transmissionIdealProductDecoded':dt(et(a)*et(b))})
sequences=[]
for n,dmass in [(10,.01),(100,.001),(1000,.0001),(100,.01),(1000,.001)]:
 t=1.
 for _ in range(n):t=q(t*math.exp(-k*dmass))
 sequences.append({'draws':n,'massPerDraw':dmass,'trueMass':n*dmass,'encodedRepeatedProductDecoded':-math.log(max(t,1/255))/k,'finalEncodedT':t})
(p/'cpu-properties.json').write_text(json.dumps({'M':M,'mu':mu,'kTransmission':k,'roundTrip':rows,'fixedBlendCounterexamples':viol,'rgba8PerDrawQuantizationCounterexamples':sequences,'model':'Ideal nearest UNORM8 rounding per framebuffer write; actual blending precision/dither device-dependent. No GPU.'},indent=2))

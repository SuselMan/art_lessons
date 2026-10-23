import json,math,random
from pathlib import Path
import numpy as np
from audit import white
p=Path(__file__).parent;fit=json.loads((p/'finite-poly-fit.json').read_text());coeff=fit['fits'][-1]['coeffRatioAscending'];maxTau=math.log(50)
def coefficient(y):
    y=np.float32(min(max(y,0),maxTau));v=np.float32(0)
    for c in coeff[::-1]:v=np.float32(v*y+np.float32(c))
    return max(float(v*y),0)
rows=[];maxRef=0;minimum=1;maximum=0;rng=random.Random(41)
for _ in range(10000):
    strength=rng.random();tau=[rng.random()*12 for i in range(3)];color=[math.exp(-t) for t in tau];darkness=1-sum(c*w for c,w in zip(color,[.2126,.7152,.0722]));tint=1+1.2*darkness**4;mref=.5*max(strength,.004);alphaRef=1-math.exp(-mref*tint/.54);m=rng.random();d=m/mref
    for c in color:
        target=1-alphaRef*(1-c);y=-math.log(target);k=coefficient(y);ref=white(k,.2,1);out=white(k,.2,d)
        assert 0<=out<=1+1e-10
        assert white(k,.2,0)==1
        maxRef=max(maxRef,abs(ref-target));minimum=min(minimum,out);maximum=max(maximum,out)
# Thick finite law below original paintfloor examples.
for c in [.02,.2,.5,.8]:
    alphaRef=1-math.exp(-.5/.54);target=1-alphaRef*(1-c);k=coefficient(-math.log(target));infinity=.2/(k+.2+math.sqrt(k*(k+.4))) if k else 1
    rows.append({'paintColor':c,'referenceReflectance':target,'calibratedReference':white(k,.2,1),'infiniteReflectance':infinity,'paintFloorEliminated':abs(infinity-c)>1e-4})
assert maxRef<2e-5
(p/'finite-poly-properties.json').write_text(json.dumps({'trials':10000,'channels':30000,'Qref':.2,'maxReferenceErrorActualTintFloat32':maxRef,'outputMin':minimum,'outputMax':maximum,'zeroMassReflectance':1,'massRange':[0,1],'strengthRange':[0,1],'tauRange':[0,12],'thickExamples':rows},indent=2)+'\n')
print('30000 fullfilm channelsPASS maxreferenceerror',maxRef)

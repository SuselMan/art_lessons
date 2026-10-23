import math,json,random
from pathlib import Path

def optical(m,strength,tau,scatter):
    density=1-math.exp(-m/.54);paint=math.exp(-max(tau,0));legacy=1-density*(1-paint)
    t=max(m/(.5*max(strength,.004))-1,0)
    if t==0:return legacy,legacy,True
    c=max(.0001,min(1,paint));q=scatter*t;l=q*(1-c)**2/(2*c)
    if l==0:r=q/(1+q);tr=1/(1+q)
    else:
        h=math.sqrt(l*(l+2*q));e=math.exp(-h);z=2*h*(1-h+2*h*h/3) if h<.001 else 1-e*e
        den=(l+q)*z+h*(1+e*e);r=q*z/den;tr=2*h*e/den
    result=r+tr*tr*legacy/max(1-r*legacy,1e-6)
    return result,legacy,False
rng=random.Random(17);thin=0;checked=0
for scatter in [.2,.8]:
 for _ in range(50000):
    strength=rng.random();m=rng.random()*1.;tau=rng.random()*12
    result,legacy,exact=optical(m,strength,tau,scatter)
    assert -1e-10<=result<=1+1e-10
    if exact:assert result==legacy;thin+=1
    checked+=1
 # Zero and purewhite; contiguous atreference; thickinverse target.
 for strength in [0,.004,.1,1]:
    assert optical(0,strength,2,scatter)==(1.,1.,True)
    ref=.5*max(strength,.004)
    a=optical(ref,strength,2,scatter)[0];b=optical(ref*(1+1e-8),strength,2,scatter)[0]
    assert abs(a-b)<1e-7
 for tau in [0,.01,.2,1,3.9,12]:
    result=optical(1e8,1,tau,scatter)[0];target=max(.0001,math.exp(-tau))
    assert abs(result-target)<1e-6
out={'randomBoundChecks':checked,'exactLegacyThinCases':thin,'referenceContinuity':True,'zeroMassLegacyExact':True,'infiniteLayerColorLimit':True,'massDomain':[0,1],'tauDomain':[0,12],'strengthDomain':[0,1],'scattering':[.2,.8],'note':'CPU emulates shader smallH polynomial; not GPU precision orphysicalgrain/alpha proof.'}
Path(__file__).with_name('excess-layer-tests.json').write_text(json.dumps(out,indent=2)+'\n');print(out)

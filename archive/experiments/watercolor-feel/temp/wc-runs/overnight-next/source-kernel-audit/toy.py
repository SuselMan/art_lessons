import json,numpy as np
x=np.linspace(-1,1,20001);rad=np.linspace(0,1,20001);results=[]
for q in [1.5,2.]:
 # Smooth interior compact kernel, distinct from AA cov. Analytical integral:
 # disc integral(1-r²)^q = pi/(q+1); ribbon integral(1-x²)^q = beta(.5,q+1).
 strip=(1-x*x)**q;disc=(1-rad*rad)**q
 stripgain=2/np.trapezoid(strip,x);discgain=1/np.trapezoid(disc*2*rad,rad)
 # AA-only example radius25, AA1: baseline plateau apart from last4% radius.
 aa=np.clip((1-rad)*25,0,1);aaratio=np.trapezoid(aa**q*2*rad,rad)/np.trapezoid(aa*2*rad,rad)
 results.append({'q':q,'stripGain':float(stripgain),'discGain':float(discgain),'AAOnlyMassRatio':float(aaratio),'centerPeakGainDisc':float(discgain),'massGainIfSameDiscConstantAppliedToStrip':float(discgain/stripgain)})
print(json.dumps({'results':results,'warning':'Single primitive scalar integral only; MAX union and clipping break normalization. Strip/disc require different constants, aspect affine cancels normalized integral.'},indent=2))

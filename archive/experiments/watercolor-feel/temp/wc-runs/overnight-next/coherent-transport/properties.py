import math,random,json
from pathlib import Path
rng=random.Random(23);count=0;worstPressure=0;worstTangent=0
for _ in range(100000):
 a=rng.random()*2*math.pi;r=rng.random();v=(r*math.cos(a),r*math.sin(a));b=rng.random()*2*math.pi;s=rng.random();w=(s*math.cos(b),s*math.sin(b));mean=((v[0]+w[0])/2,(v[1]+w[1])/2);pressure=.12*(abs(v[0])+abs(v[1]))+.72;tangent=.18*(abs(v[0])+abs(v[1]))+.18*sum(.15+.85*m*m for m in [mean[0],-mean[0],mean[1],-mean[1]])
 assert pressure<=.12*math.sqrt(2)+.72+1e-12 and tangent<=.18*math.sqrt(2)+.72+1e-12
 worstPressure=max(worstPressure,pressure);worstTangent=max(worstTangent,tangent)
 # One undirectedpair, immutablecoefficient/densityrecords; allchannels samefractions.
 m0,m1=rng.random(),rng.random();h0,h1=rng.random(),rng.random();release0=m0/(m0+.02+.35*(1-h0)**2);release1=m1/(m1+.02+.35*(1-h1)**2);base=rng.random()*.12;f0,f1=base*release0,base*release1
 for _ in range(4):
  c0,c1=rng.random(),rng.random();o0=c0*(1-f0)+c1*f1;o1=c1*(1-f1)+c0*f0
  assert min(o0,o1)>=0 and abs(o0+o1-c0-c1)<1e-14
 count+=1
out={'trials':count,'pressureOutgoingUpperBound':.96,'pressureObservedUpper':worstPressure,'tangentPhysicalVelocityOutgoingBound':.18*math.sqrt(2)+.72,'tangentObservedUpper':worstTangent,'bindingPairChannelConservation':True,'note':'Realvaluedclosedpair proof. FullGPU8bit,bilinear,scissor andprogramexecution nottested.'};Path(__file__).with_name('property-tests.json').write_text(json.dumps(out,indent=2)+'\n');print(out)

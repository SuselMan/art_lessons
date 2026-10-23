import math,json,random
from pathlib import Path
from audit import white,calibrate
p=Path(__file__).parent
# Infinite layer calibration: C∞=exp(-tau), K/S=(1-C∞)^2/(2C∞).
# Ordinary-film LUT: target exp(-tau) at normalized thickness1, Sref=.2.
N=256;maxTau=math.log(50);lut=[calibrate(math.exp(-maxTau*i/(N-1))) if i else 0 for i in range(N)]
rows=[];maxError=0
for tau in [0,.1,.5,1,2,3.9]:
 c=math.exp(-tau);a=(1-c)**2/(2*c);kInf=.2*a
 k=calibrate(c) if tau else 0
 rows.append({'tau':tau,'target':c,'infiniteCalibrationFilm1':white(kInf,.2,1),'lutCalibrationFilm1':white(k,.2,1),'lutDense3':white(k,.2,3),'analyticInfiniteDense3':white(kInf,.2,3)})
r=random.Random(4)
for _ in range(10000):
 tau=r.random()*maxTau;t=tau/maxTau*(N-1);i=min(N-2,int(t));f=t-i;k=lut[i]*(1-f)+lut[i+1]*f
 error=abs(white(k,.2,1)-math.exp(-tau));maxError=max(maxError,error)
 assert 0<=white(k,.2,1)<=1
assert maxError<.001
(p/'practical-examples.json').write_text(json.dumps({'samples':rows,'lutNodes':N,'lutInterpolationTests':10000,'maxFilmTargetErrorFloatLUT':maxError,'tauDomain':[0,maxTau],'lutKd':lut},indent=2)+'\n')
print('10000 LUT interpolation checksPASS maxfilmerror',maxError)

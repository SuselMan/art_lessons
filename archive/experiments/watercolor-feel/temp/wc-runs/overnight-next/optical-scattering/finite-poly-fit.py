import numpy as np,math,json
from pathlib import Path
from audit import calibrate,white
from numpy.polynomial import Chebyshev,Polynomial
p=Path(__file__).parent;maximum=math.log(50)
x=np.linspace(0,maximum,2049);k=np.array([calibrate(math.exp(-t)) if t else 0 for t in x]);ratio=np.divide(k,x,out=np.zeros_like(k),where=x>0);ratio[0]=ratio[1]
rows=[]
for degree in [6,8,10,12]:
 poly=Chebyshev.fit(x,ratio,degree-1,domain=[0,maximum]).convert(kind=Polynomial)
 test=np.linspace(0,maximum,10001);coeff=poly.coef.astype(np.float32);fit=np.zeros_like(test,dtype=np.float32)
 for c in coeff[::-1]:fit=fit*test.astype(np.float32)+c
 fit*=test.astype(np.float32);err=max(abs(white(float(a),.2,1)-math.exp(-float(t))) for t,a in zip(test,fit));rows.append({'degree':degree,'coeffRatioAscending':poly.coef.tolist(),'maxReferenceErrorFloat32Horner':err,'minimumKd':float(fit.min())})
print(rows)
(p/'finite-poly-fit.json').write_text(json.dumps({'Qref':.2,'inputDomain':[0,maximum],'nodes':2049,'validationPoints':10001,'fits':rows},indent=2)+'\n')

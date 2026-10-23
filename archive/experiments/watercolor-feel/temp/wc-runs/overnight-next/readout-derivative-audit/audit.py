import json,math
from pathlib import Path
r=Path(__file__).parent;inp=json.load(open(r.parent/'inputs.json'));out=[]
for cid in ['s9-n3','s6-n6']:
 c=next(c for c in inp['cases']if c['id']==cid);paint=[max(.02,v)for v in c['ops'][0]['color']];dark=1-sum(a*b for a,b in zip(paint,[.2126,.7152,.0722]));tint=1+1.2*dark**4;k=tint/.54;opacity=.99
 rows=[]
 for code in [37,75,114,157]:
  m=2*code/255;density=1-math.exp(-k*m);der=[opacity*(1-v)*k*math.exp(-k*m)for v in paint];rows.append(dict(encodedCarrierCode=code,decodedPigmentMassIfStrength1=m,density=density,whiteRGB=[1-opacity*density*(1-v)for v in paint],absRGBDerivativePerMass=der,absRGBCodeChangeForPhysicalQuantum=[255*x*2/255 for x in der],slopeRelativeToMassZero=math.exp(-k*m)))
 out.append(dict(case=cid,swatchApproxPaint=paint,tint=tint,k=k,rows=rows))
(r/'derivatives.json').write_text(json.dumps(dict(scope='Actual composite density branch analytical derivative, single pigment on white, fixed paint, coverage1 opacity.99, neutral gran/cloud/papermod/wet. PERCENTILES37/75/114/157 are measured PREbrush9 carrierA; 6 table same mass axes only, NOT measured6 percentiles or strength1 claim.',results=out),indent=2));print(json.dumps(out[0],indent=2))

import random, math, json
from pathlib import Path
r=random.Random(68141); s=.25; worst=0.; qworst=0.
for _ in range(100000):
    m=r.uniform(.005, .99); water=r.random(); wet=r.random(); strength=r.random()
    tau=[r.uniform(0,math.log(50)) for _ in range(3)]
    ink=[m*water,m*wet,m*strength,m]; depth=[m*strength*t/4 for t in tau]+[m*strength]
    enc=[v*s for v in ink]; encd=[v*s for v in depth]
    decoded=[v/s for v in enc]; decd=[v/s for v in encd]
    prior=.12*(1-min(max(depth[3]/.12,0),1)**2*(3-2*min(max(depth[3]/.12,0),1)))
    for j in range(3):
        a=(depth[j]*4+tau[j]*prior)/(depth[3]+prior)
        b=(decd[j]*4+tau[j]*prior)/(decd[3]+prior)
        worst=max(worst,abs(a-b)); assert abs(a-b)<1e-12
    fraction=r.random(); left=[x*(1-fraction) for x in enc]; right=[x*fraction for x in enc]
    assert all(x>=0 for x in left+right)
    assert max(abs(a+b-c) for a,b,c in zip(left,right,enc))<1e-12
    q=round(m*s*255)/255/s; qworst=max(qworst,abs(q-m)); assert abs(q-m)<=2/255+1e-12
out={'samples':100000,'seed':68141,'idealTauMaxError':worst,'decodedQuarterQuantizationMaxError':qworst,'quantizationBound':2/255,'sharedDonorFractionConservation':True,'scope':'nonclipped real-arithmetic encoding identity; capacity expansion is not invariant; no GPU execution claimed'}
Path(__file__).with_name('independent-properties.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))

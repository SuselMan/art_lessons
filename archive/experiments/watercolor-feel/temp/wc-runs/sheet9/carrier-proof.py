"""Exact rational checks of a coupled finite-volume step; no GPU claims."""
from fractions import Fraction as F
from random import Random
import json
rng=Random(9)
def step(w,p,flows):
 n=len(w);out=[F(0) for _ in w]
 for i,j,q in flows:
  assert 0<=q;out[i]+=q
 limits=[min(F(1),w[i]/out[i]) if out[i] else F(1) for i in range(n)]
 wn=w[:];pn=p[:]
 for i,j,q in flows:
  q*=limits[i];pig=q*p[i]/w[i] if w[i] else F(0)
  wn[i]-=q;wn[j]+=q;pn[i]-=pig;pn[j]+=pig
 return wn,pn
checks=0
for _ in range(100):
 w=[F(rng.randrange(0,100),100) for _ in range(9)]
 p=[w0*F(rng.randrange(0,200),100) for w0 in w]
 flows=[(i,j,F(rng.randrange(0,100),100)) for i in range(9) for j in [i-1,i+1] if 0<=j<9]
 wn,pn=step(w,p,flows)
 assert sum(wn)==sum(w) and sum(pn)==sum(p)
 assert min(wn)>=0 and min(pn)>=0
 checks+=1
 # Equal concentration remains equal even with nonuniform water depths.
 c=F(7,13);wn,pn=step(w,[c*x for x in w],flows)
 assert all(y==c*x for x,y in zip(wn,pn));checks+=1
# A constant pigment amount is NOT a constant concentration when water varies.
w=[F(1),F(2)];p=[F(1),F(1)]
_,pn=step(w,p,[(0,1,F(1,2)),(1,0,F(1,2))])
assert pn==[F(3,4),F(5,4)]
# The donor can be emptied without negative water or negative pigment.
assert step([F(1),F(0)],[F(2),F(0)],[(0,1,F(100))])==([F(0),F(1)],[F(0),F(2)])
# Addition and transport do not commute: the newly added pigment must not
# undergo the earlier contact's transport.
water=[F(2),F(2)];deposit=[F(1),F(0)]
_,causal=step(water,deposit,[(0,1,F(1))]);causal[0]+=F(1)
_,late=step(water,[F(2),F(0)],[(0,1,F(1))])
assert causal!=late
print(json.dumps({'exactChecks':checks,'conservation':True,'nonnegative':True,'uniformConcentration':True,'noncommuting':{'causal':[str(x) for x in causal],'allDepositFirst':[str(x) for x in late]},'scope':'rational arithmetic, prescribed flux; not a solved hydrodynamic model or GPU verification'},indent=2))

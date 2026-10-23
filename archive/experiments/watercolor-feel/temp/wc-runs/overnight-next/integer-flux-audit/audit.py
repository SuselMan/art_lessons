import json,math,random
from pathlib import Path
rng=random.Random(23);bad=0;floorgood=0;roundbad=0
for _ in range(100000):
 n=rng.randrange(256); f=[rng.random() for _ in range(4)];f=[x*.9745584412/sum(f) for x in f]
 if sum(math.floor(n*x) for x in f)<=n:floorgood+=1
 if sum(math.floor(n*x+.5) for x in f)>n:roundbad+=1
# donor-first largest-remainder allocation with round(totalOut), recipient-safe quarter caps.
# All endpoints must recompute donor's4 fractions, the same indexed neighbour ranking.
def alloc(n,f,room):
 z=[n*x for x in f];base=[min(math.floor(x),r//4) for x,r in zip(z,room)];target=min(n,math.floor(sum(z)+.5));order=sorted(range(4),key=lambda i:(-(z[i]-math.floor(z[i])),i))
 for i in order:
  if sum(base)>=target:break
  if base[i]<room[i]//4 and base[i]<math.ceil(z[i]):base[i]+=1
 return base
for _ in range(100000):
 n=rng.randrange(256);f=[rng.random() for _ in range(4)];f=[x*.9745584412/sum(f) for x in f];room=[rng.randrange(256) for _ in range(4)];a=alloc(n,f,room)
 if sum(a)>n or any(x>r//4 for x,r in zip(a,room)):bad+=1
Path('temp/wc-runs/overnight-next/integer-flux-audit/cpu-properties.json').write_text(json.dumps({'samples':100000,'cflBound':.18*math.sqrt(2)+4*.18,'floorDonorBoundPass':floorgood,'naiveNearestDonorOverspendCases':roundbad,'budgetedQuarterCapacityViolations':bad,'oneCodeFourEdgesFloor':[math.floor(.18)]*4,'oneCodeFourEdgesBudgeted':alloc(1,[.18]*4,[255]*4),'scope':'Scalar integer code lattice only. Not full paired optical/physical shader validation; no GPU.'},indent=2))
file=Path('temp/wc-runs/overnight-next/integer-flux-audit/cpu-properties.json');d=json.loads(file.read_text())
def cumulative(n,f,phase):
 c=0;q=[]
 for x in f:
  before=math.floor(n*c+phase);c+=x;q.append(math.floor(n*c+phase)-before)
 return q
bad=0
for _ in range(100000):
 n=rng.randrange(256);f=[rng.random() for _ in range(4)];f=[x*.9745584412/sum(f) for x in f];q=cumulative(n,f,rng.random())
 if min(q)<0 or sum(q)>n:bad+=1
d['cumulative']={'samples':100000,'donorBoundViolations':bad,'oneCodePhase0':cumulative(1,[.18]*4,0),'oneCodePhase05':cumulative(1,[.18]*4,.5),'roomQuarterCounterexample':{'n':3,'edgeFraction':.18,'phase':.5,'recipientRoomCodes':3,'incomingPerEdge':1,'fourDonorsIncoming':4,'resultOverCapacity':True},'ratioCounterexample':{'N_A':3,'N_B':2,'fractions':[.4,.2,0,0],'phase':0,'AFlux':cumulative(3,[.4,.2,0,0],0),'BFlux':cumulative(2,[.4,.2,0,0],0),'secondEdgeBgreaterA':True},'expectationProof':'For uniform phase r in[0,1), E[floor(x+r)]=x. Therefore E[Tk]=N*fk; telescope gives sum floor(N*F+r) <=N for F<=1. Capacity clipping/phase reuse across steps destroys simple unbiased-path claim.'}
file.write_text(json.dumps(d,indent=2))

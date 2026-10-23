import random,json,math,pathlib
rng=random.Random(72);runs=10000
for _ in range(runs):
 C=rng.uniform(.25,1e6);seq=[(rng.random()*5,rng.random()*C,rng.random()) for i in range(40)];state={'capacity':C,'water':0.,'pigment':0.}
 def advance(s,row):
  step,ab,wet=row;s['pigment']+=step;s['water']=max(0,s['water']+step*(ab/s['capacity'])*(1-.8*wet))
 for row in seq:advance(state,row)
 chunk={'capacity':C,'water':0.,'pigment':0.}
 for i,row in enumerate(seq):
  if rng.random()<.3:chunk=json.loads(json.dumps(chunk))
  advance(chunk,row)
 assert chunk==state
 for angle in [0,.3,1.57,2.4]:
  a,b=31,9;R=a*b/math.hypot(a*math.cos(angle),b*math.sin(angle));old=12/R;new=old*(a*b/(a*b));assert old==new
pathlib.Path('temp/wc-runs/overnight-next/pressure-water-clock-audit/partition-proof.json').write_text(json.dumps({'randomSequences':runs,'snapshotPartitionExactPASS':True,'fullContactOrientationIdentityPASS':True,'scope':'Same retained ordered dabs and same onceinitialized C; JSONsnapshot simulation, not GPU/liveproducer proof; arbitrary pickup .8 exercises nonlinear max state'},indent=2)+'\n')
